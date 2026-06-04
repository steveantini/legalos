import "server-only";

import {
  getOrgMcpConnections,
  getOrgMcpExecutionTargets,
  type OrgMcpExecutionTarget,
} from "@/lib/connections/mcp/connection-state";
import {
  mapMcpToolsToAnthropic,
  type McpToolRoute,
} from "@/lib/connections/mcp/tool-mapping";
import type { AnthropicCustomTool } from "@/lib/llm/anthropic/chat";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Per-agent MCP-server governance — the agent-author layer of the two-layer model
 * (Phase 2, 2P-5, D-100). The org connects servers (Phase 1, super-admin); the
 * agent author enables which connected SERVERS an agent may use (per-server, v1).
 * This module reads an agent's enabled set, validates it against what's connected,
 * and resolves the intersection into the tool set the agentic loop offers.
 *
 * THE GUARANTEE: an agent gets a server's tools ONLY when (a) the author enabled it
 * AND (b) it is currently connected AND healthy for the org. The intersection is
 * computed at runtime against getOrgMcpExecutionTargets (active-only), so
 * disconnecting or erroring a server instantly revokes it from every agent — there
 * are no stored grants to go stale — and an unauthorized or never-connected id
 * contributes nothing.
 *
 * Server-only. Nothing in the chat route calls resolveAgentMcpTools yet — the
 * gated loop (2P-6) is its first consumer. Per-server granularity for v1; per-tool
 * is a documented future refinement.
 */

/** The agent's allowed-and-connected tool set, ready for the loop (2P-6). */
export type ResolvedAgentMcpTools = {
  /** The execution targets the agent may use (enabled ∩ org-connected-healthy). */
  targets: OrgMcpExecutionTarget[];
  /** Namespaced Anthropic custom-tool definitions for those targets (2P-2). */
  toolDefs: AnthropicCustomTool[];
  /** namespacedName → route, for executing a tool_use back to its connection. */
  routingMap: Record<string, McpToolRoute>;
};

/**
 * Tolerant read of an agent's enabled MCP server ids. Returns [] when the column
 * is absent (pre-migration) or the value isn't a string array, so callers degrade
 * to "no MCP servers enabled" rather than erroring. Service-role read of one
 * non-sensitive jsonb column (the caller has already authorized agent access).
 */
export async function getAgentEnabledMcpServers(
  agentId: string,
): Promise<string[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("agents")
    .select("enabled_mcp_servers")
    .eq("id", agentId)
    .maybeSingle();
  if (error || !data) return [];
  const value = (data as { enabled_mcp_servers?: unknown }).enabled_mcp_servers;
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

/**
 * The org's currently-CONNECTED (active) MCP server ids — the set an author may
 * enable from, and the set saves validate against. Derived from the display reader
 * filtered to active (an error'd / needs-reconnect server is not enable-able).
 */
export async function getConnectedMcpServerIds(): Promise<Set<string>> {
  const connections = await getOrgMcpConnections();
  return new Set(
    connections
      .filter((c) => c.status === "active")
      .map((c) => c.serverId),
  );
}

/** A connected server as the agent form lists it for the author to toggle. */
export type ConnectedMcpServerOption = {
  serverId: string;
  displayName: string;
  toolCount: number | null;
};

/**
 * The org's connected (active) MCP servers shaped for the agent-form toggles:
 * server id, a friendly display name (the label captured at connect), and the
 * tool count for context. Excludes error'd / needs-reconnect servers — an author
 * can only enable a healthy connected server.
 */
export async function getConnectedMcpServerOptions(): Promise<
  ConnectedMcpServerOption[]
> {
  const connections = await getOrgMcpConnections();
  return connections
    .filter((c) => c.status === "active")
    .map((c) => ({
      serverId: c.serverId,
      displayName: c.label ?? c.serverId,
      toolCount: c.tools ? c.tools.length : null,
    }));
}

/**
 * Resolve the tool set an agent may use: INTERSECT the agent's enabled server ids
 * with the org's connected+healthy execution targets (getOrgMcpExecutionTargets is
 * active-only, so error'd servers are already excluded), then map the survivors to
 * namespaced Anthropic tool defs + a routing map (2P-2). Returns empty when the
 * agent enables nothing or none of its enabled servers are currently connected.
 *
 * Returns toolDefs + routingMap (so 2P-6 has a single clean call) plus the targets.
 */
export async function resolveAgentMcpTools(
  enabledServerIds: string[],
): Promise<ResolvedAgentMcpTools> {
  if (!enabledServerIds || enabledServerIds.length === 0) {
    return { targets: [], toolDefs: [], routingMap: {} };
  }
  const enabled = new Set(enabledServerIds);
  const all = await getOrgMcpExecutionTargets();
  const targets = all.filter((target) => enabled.has(target.serverId));
  if (targets.length === 0) {
    return { targets: [], toolDefs: [], routingMap: {} };
  }
  const mapping = mapMcpToolsToAnthropic(targets);
  return {
    targets,
    toolDefs: mapping.toolDefs,
    routingMap: mapping.routingMap,
  };
}
