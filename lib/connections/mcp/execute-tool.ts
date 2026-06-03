import "server-only";

import { callMcpServerTool, McpClientError } from "@/lib/connections/mcp/client";
import type { McpToolRoute } from "@/lib/connections/mcp/tool-mapping";
import {
  getUsableAccessToken,
  TokenUnavailableError,
} from "@/lib/connections/tokens";
import type { AnthropicToolResultBlock } from "@/lib/llm/anthropic/chat";

/**
 * Single MCP tool execution (Phase 2, 2P-3) — the raw executor for one tool call.
 * Given a routing entry (from 2P-2's routingMap), the model's tool input, and the
 * tool_use id, it: resolves a fresh access token through the existing token path
 * (which refreshes MCP credentials transparently, custody ours), calls the server
 * through the Phase 1 MCP client, and shapes the outcome into an Anthropic
 * `tool_result` the model can consume.
 *
 * CRITICAL: executeMcpTool NEVER throws. Any failure (token unavailable, client
 * error, timeout, malformed result) is returned as an `is_error: true` tool_result
 * with a token/PII-safe, model-recoverable message, so one bad tool call cannot
 * crash a turn — the best-effort posture used throughout the connection work.
 *
 * Reuses callMcpServerTool and getUsableAccessToken UNCHANGED; custody stays ours
 * (the SDK never holds a token). No read/write gating here — that is 2P-4/2P-6;
 * 2P-3 executes whatever tool it is handed. Nothing in the chat route calls this
 * yet (the gated loop, 2P-6, is its first consumer). Builds under the D-100 lock.
 */

/** Per-tool-result size cap. A result is re-sent to the model on every subsequent
 * loop round (history grows), so an unbounded result would blow context and cost.
 * ~25k chars is roughly 6-8k tokens — ample for a tool result, bounded for the loop. */
const MAX_TOOL_RESULT_CHARS = 25_000;

/**
 * A token/PII-free record of one tool execution, for 2P-6 to persist into the
 * assistant message's tool_calls JSONB (the locked tracing decision). Carries no
 * arguments, no result payload, and no token — only routing identity, status, and
 * timing, plus a safe error code on failure.
 */
export type McpToolTrace = {
  serverId: string;
  connectionId: string;
  originalToolName: string;
  status: "ok" | "error";
  startedAt: string;
  finishedAt: string;
  /** A safe code on failure (e.g. 'timeout', 'unauthorized', 'refresh_failed', 'tool_error'). */
  errorCode?: string;
};

/** The outcome of executing one tool: the tool_result to feed back + a trace record. */
export type McpToolExecution = {
  toolResult: AnthropicToolResultBlock;
  trace: McpToolTrace;
};

/** True for a non-null, non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The model's tool input as MCP call arguments, or undefined when not an object. */
function asArguments(input: unknown): Record<string, unknown> | undefined {
  return isRecord(input) ? input : undefined;
}

/** JSON.stringify that never throws (circular refs, BigInt, etc.). */
function safeJsonStringify(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" ? serialized : String(value);
  } catch {
    return "[unserializable result]";
  }
}

/** Cap a result string, appending an honest truncation note when it overflows. */
function capResult(text: string): string {
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  const omitted = text.length - MAX_TOOL_RESULT_CHARS;
  return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n\n[Result truncated: ${omitted} more characters omitted.]`;
}

/** Concatenated text from an MCP result's text content blocks, or null if none. */
function extractText(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const block of content) {
    if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

/** A token-free description of non-text result blocks (images, resources, etc.). */
function describeNonText(content: unknown[]): string {
  const types = content.map((block) =>
    isRecord(block) && typeof block.type === "string" ? block.type : "unknown",
  );
  return `[The tool returned ${content.length} non-text result block(s): ${types.join(", ")}.]`;
}

/**
 * Shape an MCP CallToolResult (`unknown`) into tool_result text. Rules, in order:
 * concatenated text content; else structuredContent (JSON); else a description of
 * non-text blocks (or an empty-result note); else the whole result as JSON. The
 * result is size-capped. `isToolError` reflects the MCP result's `isError` flag —
 * an MCP tool can report a tool-level failure without the protocol throwing, and
 * the model should be told.
 */
function shapeSuccess(raw: unknown): { content: string; isToolError: boolean } {
  if (!isRecord(raw)) {
    return { content: capResult(safeJsonStringify(raw)), isToolError: false };
  }
  const isToolError = raw.isError === true;

  const text = extractText(raw.content);
  if (text && text.length > 0) {
    return { content: capResult(text), isToolError };
  }
  if (isRecord(raw.structuredContent)) {
    return { content: capResult(safeJsonStringify(raw.structuredContent)), isToolError };
  }
  if (Array.isArray(raw.content)) {
    const content =
      raw.content.length === 0
        ? "[The tool returned an empty result.]"
        : describeNonText(raw.content);
    return { content, isToolError };
  }
  return { content: capResult(safeJsonStringify(raw)), isToolError };
}

/** Build an is_error tool_result + error trace, never leaking token/PII material. */
function errorExecution(
  route: McpToolRoute,
  toolUseId: string,
  startedAt: string,
  errorCode: string,
  message: string,
): McpToolExecution {
  return {
    toolResult: {
      type: "tool_result",
      tool_use_id: toolUseId,
      content: message,
      is_error: true,
    },
    trace: {
      serverId: route.serverId,
      connectionId: route.connectionId,
      originalToolName: route.originalToolName,
      status: "error",
      startedAt,
      finishedAt: new Date().toISOString(),
      errorCode,
    },
  };
}

/** Safe code + message for a token-resolution failure (connection needs attention). */
function tokenFailure(err: unknown): { code: string; message: string } {
  const code = err instanceof TokenUnavailableError ? err.reason : "token_unavailable";
  return {
    code,
    message:
      "The tool call failed: the connection could not be authorized and may need to be reconnected.",
  };
}

/** Safe code + model-recoverable message for an MCP client failure. */
function clientFailure(err: unknown): { code: string; message: string } {
  const reason = err instanceof McpClientError ? err.reason : "unreachable";
  const detail: Record<string, string> = {
    invalid_url: "the server address is not configured correctly",
    unauthorized: "the connection is not authorized and may need to be reconnected",
    timeout: "the server did not respond in time",
    unreachable: "the server could not be reached",
  };
  return {
    code: reason,
    message: `The tool call failed: ${detail[reason] ?? "an unexpected error occurred"}.`,
  };
}

/**
 * Execute one MCP tool call and return a tool_result (+ trace). Never throws.
 *
 *   1. Resolve a fresh token via getUsableAccessToken (MCP-aware refresh path).
 *   2. Call the server via callMcpServerTool with the ORIGINAL tool name + input.
 *   3. Shape the outcome into an Anthropic tool_result (success or is_error).
 */
export async function executeMcpTool(params: {
  route: McpToolRoute;
  toolInput: unknown;
  toolUseId: string;
}): Promise<McpToolExecution> {
  const { route, toolInput, toolUseId } = params;
  const startedAt = new Date().toISOString();

  // A connection with no stored server URL can't be called; fail closed cleanly.
  if (!route.serverUrl) {
    return errorExecution(
      route,
      toolUseId,
      startedAt,
      "no_server_url",
      "The tool call failed: the server address is not configured.",
    );
  }

  // 1. Fresh access token (MCP refresh handled transparently; custody ours).
  let accessToken: string;
  try {
    accessToken = await getUsableAccessToken(route.connectionId, route.tokenRef);
  } catch (err) {
    const { code, message } = tokenFailure(err);
    return errorExecution(route, toolUseId, startedAt, code, message);
  }

  // 2. Call the server (Phase 1 client: 15s timeout, always-dispose, token-safe).
  let raw: unknown;
  try {
    raw = await callMcpServerTool({
      serverUrl: route.serverUrl,
      accessToken,
      toolName: route.originalToolName,
      arguments: asArguments(toolInput),
    });
  } catch (err) {
    const { code, message } = clientFailure(err);
    return errorExecution(route, toolUseId, startedAt, code, message);
  }

  // 3. Shape the result (may itself report a tool-level error via MCP isError).
  const shaped = shapeSuccess(raw);
  return {
    toolResult: {
      type: "tool_result",
      tool_use_id: toolUseId,
      content: shaped.content,
      ...(shaped.isToolError ? { is_error: true } : {}),
    },
    trace: {
      serverId: route.serverId,
      connectionId: route.connectionId,
      originalToolName: route.originalToolName,
      status: shaped.isToolError ? "error" : "ok",
      startedAt,
      finishedAt: new Date().toISOString(),
      ...(shaped.isToolError ? { errorCode: "tool_error" } : {}),
    },
  };
}
