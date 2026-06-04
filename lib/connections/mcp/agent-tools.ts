import "server-only";

import {
  getOrgMcpExecutionTargets,
  type OrgMcpExecutionTarget,
} from "@/lib/connections/mcp/connection-state";
import {
  mapMcpToolsToAnthropic,
  type McpToolRoute,
} from "@/lib/connections/mcp/tool-mapping";
import { isCategoryAllowed } from "@/lib/connections/policy";
import { MCP_CATEGORY_ID } from "@/lib/connections/policy-derivation";
import type { AnthropicCustomTool } from "@/lib/llm/anthropic/chat";

/**
 * Org-level MCP-to-agent governance (Phase 2). MCP tool access for agents is
 * governed ENTIRELY at the org level by the super admin, via two existing levers
 * that must BOTH agree (no per-agent selection — basic users author their own
 * agents, so per-agent gating doesn't govern):
 *
 *   Gate 1 — the org's Allowed-connections policy PERMITS the 'mcp' category
 *            (isCategoryAllowed; the org-wide on/off switch, meaningful because the
 *            org also has non-MCP connection kinds).
 *   Gate 2 — the server is connected AND healthy (getOrgMcpExecutionTargets is
 *            active-only, so error'd / needs-reconnect servers are excluded).
 *
 * THE GUARANTEE: an agent gets MCP tools only when the super admin (1) permits the
 * MCP category AND (2) has the server connected+healthy. Denying the category
 * org-wide, OR disconnecting/erroring a server, instantly removes the tools from
 * EVERY agent. There are no per-agent grants and nothing for a basic user to
 * configure; proper agent use is a training/policy matter.
 *
 * Server-only. Nothing in the chat route calls resolveOrgMcpTools yet — the gated
 * loop (2P-6) is its first consumer. This replaces the per-agent resolver removed
 * with 2P-5's reversal.
 */

/** The org's available MCP tool set, ready for the loop (2P-6). */
export type ResolvedOrgMcpTools = {
  /** The execution targets in scope (permitted category ∩ connected-healthy). */
  targets: OrgMcpExecutionTarget[];
  /** Namespaced Anthropic custom-tool definitions for those targets (2P-2). */
  toolDefs: AnthropicCustomTool[];
  /** namespacedName → route, for executing a tool_use back to its connection. */
  routingMap: Record<string, McpToolRoute>;
};

const EMPTY: ResolvedOrgMcpTools = { targets: [], toolDefs: [], routingMap: {} };

/**
 * Resolve the MCP tool set available to any agent in the org: gate on the
 * Allowed-connections 'mcp' category being permitted (gate 1), intersect with the
 * org's connected+healthy execution targets (gate 2, active-only), then map the
 * survivors to namespaced Anthropic tool defs + a routing map (2P-2). Returns
 * empty when the category is denied or no healthy server is connected.
 *
 * No per-agent filter: every agent in the org sees the same org-permitted+connected
 * tool set. Returns toolDefs + routingMap (the single clean call for 2P-6) plus the
 * targets.
 */
export async function resolveOrgMcpTools(): Promise<ResolvedOrgMcpTools> {
  // Gate 1: org-wide Allowed-connections policy must permit the MCP category.
  if (!(await isCategoryAllowed(MCP_CATEGORY_ID))) {
    return EMPTY;
  }
  // Gate 2: connected + healthy servers (active-only).
  const targets = await getOrgMcpExecutionTargets();
  if (targets.length === 0) {
    return EMPTY;
  }
  const mapping = mapMcpToolsToAnthropic(targets);
  return {
    targets,
    toolDefs: mapping.toolDefs,
    routingMap: mapping.routingMap,
  };
}
