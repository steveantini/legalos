import "server-only";

import { getCurrentUserProfile, isCurrentUserOrgAdmin } from "@/lib/auth/access";
import { resolveOrgMcpTools } from "@/lib/connections/mcp/agent-tools";
import { classifyMcpTool } from "@/lib/connections/mcp/tool-classification";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateWorkflowDefinition } from "@/lib/workflows/validate";
import type { WorkflowStep } from "@/lib/workflows/types";

/**
 * Authoring a workflow definition (Workflows arc Step 4a).
 *
 * The builder edits the CANONICAL declarative graph directly — there is no
 * separate "UI format". saveWorkflowDefinition validates the exact `{ steps }`
 * jsonb the engine runs with the SAME validateWorkflowDefinition the engine uses
 * (the data-boundary gate a future agent-emitted definition would also pass),
 * then persists it. So what you build is exactly what runs.
 *
 * Validation policy: a definition with steps is fully validated (structure +
 * resolvable, governed capabilities + mapping integrity) for BOTH draft and
 * active, so a stored definition is always valid-or-empty. The one relaxation:
 * an empty draft (zero steps, work in progress) may be saved; activating
 * requires at least one step.
 */

export type SaveWorkflowInput = {
  id: string | null;
  name: string;
  description: string;
  departmentId: string | null;
  status: "draft" | "active";
  steps: WorkflowStep[];
};

export type SaveWorkflowResult =
  | { ok: true; id: string }
  | { ok: false; error?: string; errors?: string[] };

export async function saveWorkflowDefinition(
  input: SaveWorkflowInput,
): Promise<SaveWorkflowResult> {
  // Authoring is an org-admin action (re-verified server-side; RLS re-enforces).
  if (!(await isCurrentUserOrgAdmin())) {
    return { ok: false, error: "You don't have permission to edit workflows." };
  }

  const profile = await getCurrentUserProfile();
  if (!profile || !profile.organization_id) {
    return { ok: false, error: "unauthenticated" };
  }
  const organizationId = profile.organization_id;
  const userId = profile.id;

  const name = input.name.trim();
  if (!name) {
    return { ok: false, errors: ["Give the workflow a name."] };
  }
  if (input.status !== "draft" && input.status !== "active") {
    return { ok: false, error: "invalid_status" };
  }

  const supabase = await createSupabaseServerClient();
  const steps = Array.isArray(input.steps) ? input.steps : [];

  // Validate the canonical definition with LIVE resolvers — the same gate the
  // engine applies at run start. An empty draft is the only thing allowed to skip
  // it (you can't activate an empty workflow).
  if (input.status === "active" && steps.length === 0) {
    return { ok: false, errors: ["Add at least one step before activating."] };
  }
  if (steps.length > 0) {
    const mcp = await resolveOrgMcpTools();
    const validation = await validateWorkflowDefinition(
      { steps },
      {
        isAgentRunnable: async (agentId: string) => {
          const { data } = await supabase
            .from("agents")
            .select("id")
            .eq("id", agentId)
            .eq("is_active", true)
            .eq("type", "native")
            .maybeSingle();
          return Boolean(data);
        },
        classifyTool: async (serverId: string, toolName: string) => {
          const target = mcp.targets.find((t) => t.serverId === serverId);
          const descriptor = target?.tools?.find((d) => d.name === toolName);
          return descriptor ? classifyMcpTool(descriptor) : null;
        },
      },
    );
    if (!validation.ok) {
      return { ok: false, errors: validation.errors };
    }
  }

  const row = {
    name,
    description: input.description.trim() || null,
    department_id: input.departmentId || null,
    status: input.status,
    definition: { steps },
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("workflow_definitions")
      .update(row)
      .eq("id", input.id)
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("workflow_definitions update failed", { code: error.code });
      return { ok: false, error: "The workflow couldn't be saved." };
    }
    if (!data) return { ok: false, error: "not_found" };
    return { ok: true, id: data.id as string };
  }

  const { data, error } = await supabase
    .from("workflow_definitions")
    .insert({ ...row, organization_id: organizationId, created_by: userId })
    .select("id")
    .single();
  if (error || !data) {
    console.error("workflow_definitions insert failed", { code: error?.code });
    return { ok: false, error: "The workflow couldn't be saved." };
  }
  return { ok: true, id: data.id as string };
}
