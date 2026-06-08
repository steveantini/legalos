import "server-only";

import { getCurrentUserProfile } from "@/lib/auth/access";
import { resolveOrgMcpTools } from "@/lib/connections/mcp/agent-tools";
import { classifyMcpTool } from "@/lib/connections/mcp/tool-classification";
import { serverPrefix } from "@/lib/connections/mcp/tool-mapping";
import type { OrgMcpExecutionTarget } from "@/lib/connections/mcp/connection-state";
import type { McpToolDescriptor } from "@/lib/connections/providers/types";
import { toolLabel } from "@/lib/chat/tool-display";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Available workflow-step capabilities for the builder (Workflows arc Step 4a).
 *
 * THE TURNKEY PROPERTY: the builder never offers a hardcoded menu. It enumerates
 * the steps a workflow can take from the CURRENT, GOVERNED registries — the org's
 * native agents (the agents table, RLS-scoped to what the author can see) and the
 * org's governed, connected, healthy MCP tools (resolveOrgMcpTools: the same
 * isCategoryAllowed ∩ connected+healthy gate the engine uses). So a newly added
 * agent or a newly connected tool appears as an available step automatically,
 * with no builder change. human_checkpoint is always available.
 *
 * The MCP-target → tool-option transform is a pure function, unit-testable with
 * fakes; the resolver wraps it with the live I/O.
 */

export type AgentOption = {
  id: string;
  name: string;
  description: string | null;
};

/** One argument of a tool, from its discovered input schema. */
export type ToolArgSpec = {
  name: string;
  /** The JSON-schema type hint (string/number/…), or "string" when unknown. */
  type: string;
  required: boolean;
  description: string | null;
};

export type ToolOption = {
  serverId: string;
  /** Friendly server name, e.g. "Google Drive". */
  serverLabel: string;
  /** The ORIGINAL tool name the server expects (what a step stores). */
  toolName: string;
  /** Friendly action label, e.g. "search files". */
  actionLabel: string;
  /** Full label, e.g. "Google Drive: search files". */
  fullLabel: string;
  description: string;
  /** 'write' tools surface but are marked "requires approval" (Step 3). */
  access: "read" | "write";
  args: ToolArgSpec[];
};

export type DepartmentOption = { id: string; name: string };

export type WorkflowCapabilities = {
  agents: AgentOption[];
  tools: ToolOption[];
  departments: DepartmentOption[];
};

/** True for a non-null, non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read a tool's argument specs from its discovered JSON-schema, defensively. */
function argsFromSchema(inputSchema: unknown): ToolArgSpec[] {
  if (!isRecord(inputSchema) || !isRecord(inputSchema.properties)) return [];
  const required = Array.isArray(inputSchema.required)
    ? new Set(inputSchema.required.filter((r): r is string => typeof r === "string"))
    : new Set<string>();
  return Object.entries(inputSchema.properties).map(([name, raw]) => {
    const prop = isRecord(raw) ? raw : {};
    const type = typeof prop.type === "string" ? prop.type : "string";
    const description = typeof prop.description === "string" ? prop.description : null;
    return { name, type, required: required.has(name), description };
  });
}

/**
 * PURE: map the org's governed MCP execution targets to builder tool options,
 * reusing the chat tool-naming so labels read identically across surfaces. Each
 * tool is classified read/write (a write surfaces, marked requires-approval).
 * Targets whose catalog is null (tools not yet discovered) contribute nothing.
 */
export function mcpTargetsToToolOptions(targets: OrgMcpExecutionTarget[]): ToolOption[] {
  const options: ToolOption[] = [];
  for (const target of targets) {
    if (!target.tools) continue;
    const prefix = serverPrefix(target.serverId);
    for (const descriptor of target.tools as McpToolDescriptor[]) {
      const label = toolLabel(`${prefix}__${descriptor.name}`);
      options.push({
        serverId: target.serverId,
        serverLabel: label.server ?? label.full,
        toolName: descriptor.name,
        actionLabel: label.action,
        fullLabel: label.full,
        description: descriptor.description ?? "",
        access: classifyMcpTool(descriptor),
        args: argsFromSchema(descriptor.inputSchema),
      });
    }
  }
  // Stable, readable order: by server label, then action label.
  return options.sort(
    (a, b) => a.serverLabel.localeCompare(b.serverLabel) || a.actionLabel.localeCompare(b.actionLabel),
  );
}

/**
 * Resolve the live, governed capabilities the builder offers for this org. Runs
 * in a request context (RLS-scoped reads), consistent with the rest of the
 * workflow surfaces.
 */
export async function getWorkflowCapabilities(): Promise<WorkflowCapabilities> {
  const supabase = await createSupabaseServerClient();

  // The viewing user's org (0066): resolveOrgMcpTools reads MCP execution targets
  // via the service-role client, so it must be scoped to this org explicitly.
  const profile = await getCurrentUserProfile();
  const organizationId = profile?.organization_id ?? "";

  const [agentsResult, departmentsResult, mcp] = await Promise.all([
    supabase
      .from("agents")
      .select("id, name, description")
      .eq("type", "native")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase.from("departments").select("id, name").order("sort_order", { ascending: true }),
    resolveOrgMcpTools(organizationId),
  ]);

  const agents: AgentOption[] = (agentsResult.data ?? []).map((a) => ({
    id: a.id as string,
    name: a.name as string,
    description: (a.description as string | null) ?? null,
  }));
  const departments: DepartmentOption[] = (departmentsResult.data ?? []).map((d) => ({
    id: d.id as string,
    name: d.name as string,
  }));

  return { agents, tools: mcpTargetsToToolOptions(mcp.targets), departments };
}
