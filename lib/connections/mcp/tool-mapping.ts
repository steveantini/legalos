import type {
  AnthropicCustomTool,
  AnthropicToolInputSchema,
} from "@/lib/llm/anthropic/chat";
import type { OrgMcpExecutionTarget } from "@/lib/connections/mcp/connection-state";
import { C4L_CONNECTORS } from "@/lib/connections/providers/c4l-connector-catalog";

/**
 * MCP tool mapping + namespacing (Phase 2, 2P-2) — the pure transform from an
 * org's connected MCP tools to (a) Anthropic custom-tool definitions the model can
 * be offered and (b) a routing map back to each tool's connection, so a later step
 * (2P-3/2P-6) can execute a tool_use against the right server.
 *
 * Pure and dependency-free: no I/O, no model call, no execution, no Node APIs. It
 * is server-safe (only imported by server code) but has no runtime side effects,
 * so it is trivially unit-testable. Nothing in the chat route references it yet —
 * the gated loop (2P-6) is its first consumer. Builds under the D-100 design lock
 * (docs/PHASE2_MCP_TOOLUSE.md).
 *
 * NOT here (later steps): read/write annotation capture + classification (2P-4),
 * per-agent governance filtering (2P-5), execution (2P-3), the loop (2P-6). 2P-2
 * maps name / description / input_schema only.
 */

/** Anthropic's tool-name constraint: ^[A-Za-z0-9_-]{1,64}$. */
const TOOL_NAME_MAX = 64;
const NAMESPACE_SEP = "__";
const SELF_HOSTED_MARKER = "self-hosted:";

/**
 * Clean, fixed prefixes for the known first-party servers: the lock's gdrive /
 * gmail / gcal, plus every Claude for Legal catalog connector (each declares
 * its own `toolPrefix`, so adding a connector to the catalog brings its clean
 * namespace with it). Any server not listed here derives a prefix from its id
 * (see serverPrefix). Keyed by the registry serverId.
 */
const KNOWN_SERVER_PREFIXES: Record<string, string> = {
  "google-drive-mcp": "gdrive",
  "google-gmail-mcp": "gmail",
  "google-calendar-mcp": "gcal",
  ...Object.fromEntries(
    C4L_CONNECTORS.map((connector) => [
      connector.serverId,
      connector.toolPrefix,
    ]),
  ),
};

/** Where a namespaced tool name routes for execution (2P-3/2P-6). */
export type McpToolRoute = {
  /** The MCP server id (provider_id). */
  serverId: string;
  /** The connections row id — for getUsableAccessToken. */
  connectionId: string;
  /** The connection_secrets reference — for getUsableAccessToken. */
  tokenRef: string;
  /** The server URL the MCP client connects to. */
  serverUrl: string | null;
  /** The ORIGINAL (un-namespaced) tool name the MCP server expects in callTool. */
  originalToolName: string;
};

/** The result of mapping an org's execution targets to offerable tools + routes. */
export type McpToolMapping = {
  /** Anthropic custom-tool definitions, one per tool across all targets with a catalog. */
  toolDefs: AnthropicCustomTool[];
  /** namespacedName → route, for resolving a tool_use back to its connection. */
  routingMap: Record<string, McpToolRoute>;
  /** serverIds whose catalog was null (not yet discovered) — they contributed nothing. */
  skippedServerIds: string[];
};

/** True for a non-null, non-array object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Map any run of characters outside Anthropic's allowed set to a single
 * underscore, then trim leading/trailing underscores. Deterministic.
 */
function sanitizeSegment(segment: string): string {
  return segment.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * A short, stable, dependency-free hash (FNV-1a 32-bit → 6 base36 chars). Used to
 * keep derived server prefixes distinct per serverId and to disambiguate truncated
 * tool names, deterministically (no Node crypto, so the module stays pure).
 */
function stableHash6(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(6, "0").slice(0, 6);
}

/**
 * The short server prefix for namespacing this server's tools.
 *
 *   - Known first-party servers map to clean fixed prefixes (gdrive/gmail/gcal).
 *   - Any other server derives one from its id: strip a `self-hosted:` marker,
 *     reduce to the URL host when it parses, sanitize + lowercase + truncate to a
 *     readable slug, then append `_<hash>` of the FULL serverId so two servers can
 *     never share a prefix (the hash makes the derivation collision-resistant).
 *
 * The result contains only [A-Za-z0-9_-] and stays well under 64 chars.
 */
export function serverPrefix(serverId: string): string {
  const known = KNOWN_SERVER_PREFIXES[serverId];
  if (known) return known;

  let base = serverId;
  if (base.startsWith(SELF_HOSTED_MARKER)) {
    base = base.slice(SELF_HOSTED_MARKER.length);
    try {
      base = new URL(base).host;
    } catch {
      // Not a URL; fall back to the raw remainder.
    }
  }
  const slug = sanitizeSegment(base).slice(0, 16).toLowerCase() || "mcp";
  return `${slug}_${stableHash6(serverId)}`;
}

/**
 * Build the namespaced tool name `${prefix}__${sanitizedTool}`, guaranteed to
 * match ^[A-Za-z0-9_-]{1,64}$. If it would exceed 64 chars, the tool-name portion
 * is truncated and a short stable hash of the ORIGINAL tool name is appended, so
 * two long names sharing a truncated head stay distinct. A final sanitize+clamp is
 * defensive insurance that the regex always holds.
 */
function buildNamespacedName(prefix: string, toolName: string): string {
  const sanitizedTool = sanitizeSegment(toolName) || "tool";
  let name = `${prefix}${NAMESPACE_SEP}${sanitizedTool}`;

  if (name.length > TOOL_NAME_MAX) {
    const fixed = `${prefix}${NAMESPACE_SEP}`;
    const hash = stableHash6(toolName);
    const room = TOOL_NAME_MAX - fixed.length - (hash.length + 1); // +1 for the '_' before the hash
    const head = room > 0 ? sanitizedTool.slice(0, room) : "";
    name = `${fixed}${head}_${hash}`.slice(0, TOOL_NAME_MAX);
  }

  return name.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, TOOL_NAME_MAX);
}

/**
 * Ensure the name is unique within this request. With distinct server prefixes and
 * per-server-unique tool names this never triggers; it is a deterministic
 * last-resort guard. Appends `_2`, `_3`, … while staying within 64 chars.
 */
function uniqueName(name: string, taken: Record<string, unknown>): string {
  if (!(name in taken)) return name;
  let n = 2;
  for (;;) {
    const suffix = `_${n}`;
    const candidate = name.slice(0, TOOL_NAME_MAX - suffix.length) + suffix;
    if (!(candidate in taken)) return candidate;
    n++;
  }
}

/**
 * Normalize a server-provided JSON Schema into the object schema Anthropic custom
 * tools require. Never throws: a missing, null, or malformed schema degrades to
 * `{ type: "object", properties: {} }` so a bad server catalog can never produce an
 * invalid tool definition. A well-formed object schema is preserved (its extra
 * JSON-Schema keys ride the index signature), with `type` forced to "object",
 * `properties` guaranteed an object, and `required` kept only when it is a string
 * array (else dropped).
 */
export function normalizeInputSchema(schema: unknown): AnthropicToolInputSchema {
  if (!isPlainObject(schema)) {
    return { type: "object", properties: {} };
  }
  const properties = isPlainObject(schema.properties) ? schema.properties : {};
  const normalized: AnthropicToolInputSchema = {
    ...schema,
    type: "object",
    properties,
  };
  if (
    Array.isArray(schema.required) &&
    schema.required.every((entry) => typeof entry === "string")
  ) {
    normalized.required = schema.required as string[];
  } else {
    delete normalized.required;
  }
  return normalized;
}

/**
 * Map an org's MCP execution targets to Anthropic custom-tool definitions plus a
 * routing map. Pure: same input always yields the same output. Targets whose
 * catalog is null (tools not yet discovered) contribute nothing and are reported
 * in skippedServerIds rather than failing. Tools are processed in target order,
 * then catalog order, so the output (including any disambiguation) is deterministic.
 */
export function mapMcpToolsToAnthropic(
  targets: OrgMcpExecutionTarget[],
): McpToolMapping {
  const toolDefs: AnthropicCustomTool[] = [];
  const routingMap: Record<string, McpToolRoute> = {};
  const skippedServerIds: string[] = [];

  for (const target of targets) {
    if (!target.tools) {
      skippedServerIds.push(target.serverId);
      continue;
    }
    const prefix = serverPrefix(target.serverId);
    for (const tool of target.tools) {
      const namespaced = uniqueName(
        buildNamespacedName(prefix, tool.name),
        routingMap,
      );
      toolDefs.push({
        name: namespaced,
        description: tool.description ?? "",
        input_schema: normalizeInputSchema(tool.inputSchema),
      });
      routingMap[namespaced] = {
        serverId: target.serverId,
        connectionId: target.connectionId,
        tokenRef: target.tokenRef,
        serverUrl: target.serverUrl,
        originalToolName: tool.name,
      };
    }
  }

  return { toolDefs, routingMap, skippedServerIds };
}
