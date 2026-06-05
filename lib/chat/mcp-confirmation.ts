import type { AnthropicToolResultBlock } from "@/lib/llm/anthropic/chat";
import type { McpToolRoute } from "@/lib/connections/mcp/tool-mapping";

/**
 * Interactive MCP write-confirmation (Phase 2, 2P-7b) — the pure pieces shared
 * by the pause and resume paths. No I/O, no model call, no Node APIs, so they
 * are trivially unit-testable and safe to import from either trust boundary.
 */

/** A user's decision on a paused write. */
export type ConfirmationDecision = "approve" | "deny";

/**
 * The write the model requested, captured at pause time with everything the
 * resume path needs to execute it later (2P-7b-ii). The token is NEVER stored —
 * only the route's token_ref pointer, which resume re-resolves into a live token
 * via getUsableAccessToken (exactly as the loop does today).
 */
export type PendingMcpToolCall = {
  /** Anthropic tool_use id this write corresponds to. */
  toolUseId: string;
  /** The namespaced tool name, e.g. "gdrive__create_file". */
  name: string;
  /** Routing identity needed to execute the write on resume. */
  route: McpToolRoute;
  /** The raw tool input the model produced (needed to actually run the write). */
  input: unknown;
  /** PII-safe argument key names only (never values), for the confirmation UI. */
  argKeys: string[];
};

/** The PII-safe fields the client needs to render the Approve/Deny card. */
export type ConfirmationPayload = {
  /** The namespaced tool name, e.g. "gdrive__create_file". The client derives
   * the friendly "<Server>: <action>" label from this (the same way a reloaded
   * trace does), so live and reloaded cards read identically. */
  toolName: string;
  server: string;
  access: "write";
  argKeys: string[];
};

/**
 * Build the PII-safe confirmation payload from a pending write: the namespaced
 * tool name, the server, and only the argument KEY NAMES (never values or file
 * names, consistent with the trace's PII bar). No tool input values cross here.
 */
export function buildConfirmationPayload(
  pending: PendingMcpToolCall,
): ConfirmationPayload {
  return {
    toolName: pending.name,
    server: pending.route.serverId,
    access: "write",
    argKeys: pending.argKeys,
  };
}

/**
 * The model-facing tool_result fed back when a paused write is decided, so the
 * loop can continue gracefully. A decline reports that the action was reviewed
 * and not performed; an approval (in 2P-7b-i) reports that it is approved but
 * not yet executed — no write fires in this version. Neither is flagged
 * is_error: the outcome is a real, expected result the model should narrate,
 * not a failure to recover from.
 */
export function assembleDecisionToolResult(
  decision: ConfirmationDecision,
  toolUseId: string,
): AnthropicToolResultBlock {
  const content =
    decision === "deny"
      ? "The user reviewed this action and declined it, so it was not performed. Acknowledge their decision and continue helping; do not retry this action or attempt it another way."
      : "The user approved this action. Executing approved write actions is not yet enabled in this version, so it has not been performed yet. Let the user know it's approved and will run in an upcoming update; do not attempt it another way.";
  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content,
  };
}
