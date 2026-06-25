import "server-only";

import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

import { siteConfig } from "@/config/site";
import type {
  McpToolAnnotations,
  McpToolDescriptor,
} from "@/lib/connections/providers/types";

/**
 * The MCP client capability (flag 2b-i): a thin, isolated server-side wrapper
 * over the standard @modelcontextprotocol/sdk that can connect to a remote MCP
 * server, perform the handshake, and list (later, call) its tools.
 *
 * Isolation: this module is a standalone capability. It is NOT wired into the
 * connect routes (2b-ii), the chat route (Phase 2), the UI (2c), or any storage
 * (2b-iii) — those steps call it. It accepts an OPTIONAL bearer token, which is
 * the seam where 2b-ii's OAuth 2.1 access token attaches; 2b-i does not obtain
 * tokens itself.
 *
 * Transport: Google's official Workspace MCP servers (the first trusted surface,
 * 2a registry) are REMOTE servers over Streamable HTTP, so this uses
 * StreamableHTTPClientTransport. The bearer token, when given, rides as an
 * Authorization header via the transport's requestInit. (2b-ii may instead pass
 * the SDK's OAuthClientProvider through the transport's authProvider for full
 * refresh handling; the simple bearer path here keeps 2b-i auth-agnostic.)
 *
 * Server-only: it carries access tokens and must never reach the client bundle.
 *
 * Built against @modelcontextprotocol/sdk 1.29.0:
 *   - new Client({ name, version }, options?)
 *   - new StreamableHTTPClientTransport(url: URL, { requestInit, authProvider? })
 *   - client.connect(transport, { timeout })   // performs initialize handshake
 *   - client.listTools(params?, { timeout }) -> { tools: Tool[] }
 *   - client.callTool({ name, arguments }, schema?, { timeout }) -> result
 *   - client.close()                            // always, in finally
 */

/**
 * Identity the product presents to MCP servers in the handshake. Derived from
 * the central product name (`siteConfig.siteTitle`) so it carries no hardcoded
 * brand and renames automatically — it is an identifying name field, so nothing
 * external keys on the exact literal (D-182).
 */
const CLIENT_INFO = { name: siteConfig.siteTitle, version: "1.0.0" };

/** Per-request timeout (ms) for connect and tool calls, so a hung server can't hang the caller. */
const REQUEST_TIMEOUT_MS = 15_000;

/** Why an MCP client operation failed. Carries no token material. */
export type McpClientErrorReason =
  // The server URL was malformed.
  | "invalid_url"
  // The provided token was rejected / auth is required (HTTP 401).
  | "unauthorized"
  // The operation exceeded the timeout (hung or very slow server).
  | "timeout"
  // Could not reach the server, it isn't a working MCP server, or the handshake
  // / tools call failed for another reason.
  | "unreachable";

/**
 * A typed MCP client failure. The message and reason never include the access
 * token; only the server origin (host) is referenced, never a full URL that
 * might carry sensitive query parameters.
 */
export class McpClientError extends Error {
  constructor(
    readonly reason: McpClientErrorReason,
    readonly serverOrigin: string | null,
  ) {
    super(`MCP client error (${reason})${serverOrigin ? ` for ${serverOrigin}` : ""}`);
    this.name = "McpClientError";
  }
}

/** Parameters shared by the connect-and-do helpers. */
type McpCallParams = {
  /** The remote MCP server endpoint (Streamable HTTP). */
  serverUrl: string;
  /** Optional OAuth 2.1 bearer token (2b-ii supplies it; omit for an open/test server). */
  accessToken?: string;
};

/** The safe origin for error reporting, or null if the URL can't be parsed. */
function safeOrigin(serverUrl: string): string | null {
  try {
    return new URL(serverUrl).origin;
  } catch {
    return null;
  }
}

/** Classify an unknown SDK/transport error into a typed, token-free reason. */
function classify(err: unknown): McpClientErrorReason {
  if (err instanceof UnauthorizedError) return "unauthorized";
  if (err instanceof McpError && err.code === ErrorCode.RequestTimeout) {
    return "timeout";
  }
  // A non-2xx auth challenge can also surface as a plain error; detect a 401
  // hint without depending on a specific error class, still token-free.
  if (err instanceof Error && /\b401\b|unauthorized/i.test(err.message)) {
    return "unauthorized";
  }
  return "unreachable";
}

/**
 * Open a connection, run `op`, and ALWAYS dispose the connection. Centralizes
 * client/transport construction, the handshake, token attachment, timeouts, and
 * the token-safe error mapping so each capability (list, call) stays tiny.
 */
async function withMcpClient<T>(
  { serverUrl, accessToken }: McpCallParams,
  op: (client: Client) => Promise<T>,
): Promise<T> {
  const origin = safeOrigin(serverUrl);
  let url: URL;
  try {
    url = new URL(serverUrl);
  } catch {
    throw new McpClientError("invalid_url", origin);
  }

  const transport = new StreamableHTTPClientTransport(url, {
    // Attach the bearer token as an Authorization header when provided. 2b-ii
    // may swap this for the SDK's authProvider for automatic refresh.
    requestInit: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
  });
  const client = new Client(CLIENT_INFO, {});

  try {
    await client.connect(transport, { timeout: REQUEST_TIMEOUT_MS });
    return await op(client);
  } catch (err) {
    throw new McpClientError(classify(err), origin);
  } finally {
    // Always dispose; a close failure must not mask the original outcome.
    try {
      await client.close();
    } catch {
      // best-effort cleanup
    }
  }
}

/**
 * Connect to an MCP server and list the tools it exposes, mapped to the
 * {@link McpToolDescriptor} type. Throws {@link McpClientError} on any failure.
 *
 * This is the provable 2b-i capability: given a server URL (and, later, an OAuth
 * token), handshake and return the server's tool catalog. 2b-iii calls this at
 * connect time to record what a connected server offers.
 */
export async function listMcpServerTools(
  params: McpCallParams,
): Promise<McpToolDescriptor[]> {
  return withMcpClient(params, async (client) => {
    const result = await client.listTools(undefined, {
      timeout: REQUEST_TIMEOUT_MS,
    });
    return result.tools.map((tool) => {
      const descriptor: McpToolDescriptor = {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      };
      // Capture the read/write hints when the server provides them (2P-4); leave
      // annotations undefined when absent — the "unknown" state the classifier
      // treats conservatively as write. Only the known hint fields are stored, so
      // the persisted catalog shape stays clean.
      const captured = captureAnnotations(tool.annotations);
      if (captured) descriptor.annotations = captured;
      return descriptor;
    });
  });
}

/**
 * Map the SDK tool's annotations to the captured {@link McpToolAnnotations} subset,
 * keeping only the known, well-typed hint fields. Returns undefined when the tool
 * has no annotations or none of the known fields are present, preserving the
 * "unknown" state (no false read-only signal).
 */
function captureAnnotations(
  annotations: ToolAnnotations | undefined,
): McpToolAnnotations | undefined {
  if (!annotations) return undefined;
  const captured: McpToolAnnotations = {};
  if (typeof annotations.title === "string") captured.title = annotations.title;
  if (typeof annotations.readOnlyHint === "boolean") {
    captured.readOnlyHint = annotations.readOnlyHint;
  }
  if (typeof annotations.destructiveHint === "boolean") {
    captured.destructiveHint = annotations.destructiveHint;
  }
  if (typeof annotations.idempotentHint === "boolean") {
    captured.idempotentHint = annotations.idempotentHint;
  }
  if (typeof annotations.openWorldHint === "boolean") {
    captured.openWorldHint = annotations.openWorldHint;
  }
  return Object.keys(captured).length > 0 ? captured : undefined;
}

/**
 * Call a tool on an MCP server and return its raw result. DEFINED here for
 * 2b-iii / Phase 2 (the agent tool-use loop) and intentionally NOT called
 * anywhere in 2b-i — it shapes the module so tool execution slots in without
 * reshaping it. Throws {@link McpClientError} on failure.
 */
export async function callMcpServerTool(
  params: McpCallParams & { toolName: string; arguments?: Record<string, unknown> },
): Promise<unknown> {
  const { toolName, arguments: toolArguments, ...connect } = params;
  return withMcpClient(connect, async (client) => {
    return client.callTool(
      { name: toolName, arguments: toolArguments },
      undefined,
      { timeout: REQUEST_TIMEOUT_MS },
    );
  });
}
