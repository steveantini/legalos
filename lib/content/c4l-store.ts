import "server-only";

import type {
  C4LAgentInsert,
  C4LImportStore,
  ExistingC4LAgent,
} from "@/lib/content/c4l-import";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Service-role data access for the C4L import (C4L/platform arc, Step 3) — the
 * Supabase-backed implementation of the Step 2 `C4LImportStore`. Uses the admin
 * client (service-role) because C4L content management is a platform-level
 * operation (the same custody pattern the existing org-MCP readers use): the
 * AUTHORIZATION is the app-layer `platform_owner` gate on the action, and the
 * data op runs service-side. Reads/writes are scoped by an explicit
 * `organization_id` filter (the agents table is org-scoped).
 *
 * New agents match the existing C4L corpus exactly: native, template, active,
 * created_by null, the same model the original import used, with the provenance
 * `source_origin` the planner computed. Placement (`department_id`) and the
 * slug/source-origin identity come from the plan.
 */

/** The model the original C4L import stamped on every agent; kept for parity. */
const C4L_AGENT_MODEL = "anthropic/claude-sonnet-4-6";

/** A row as the agents table needs it for a C4L insert. */
type AgentInsertRow = {
  organization_id: string;
  department_id: string;
  slug: string;
  name: string;
  description: string;
  type: "native";
  model: string;
  system_prompt: string;
  is_template: boolean;
  is_active: boolean;
  created_by: null;
  source_origin: string;
  sort_order: number;
  tools_enabled: string[];
  default_output_format: string;
};

function toInsertRow(row: C4LAgentInsert): AgentInsertRow {
  return {
    organization_id: row.organizationId,
    department_id: row.departmentId,
    slug: row.slug,
    name: row.name,
    description: row.description,
    type: "native",
    model: C4L_AGENT_MODEL,
    system_prompt: row.systemPrompt,
    is_template: true,
    is_active: true,
    created_by: null,
    source_origin: row.sourceOrigin,
    sort_order: row.sortOrder,
    tools_enabled: [],
    default_output_format: "markdown",
  };
}

/** Build the service-role-backed import store. */
export function createC4LImportStore(): C4LImportStore {
  const admin = createSupabaseAdminClient();

  return {
    async listExistingC4LAgents(
      organizationId: string,
    ): Promise<ExistingC4LAgent[]> {
      // INCLUDES soft-deleted rows (no deleted_at filter) so the planner can see
      // the operator's curation and skip reactivating it.
      const { data, error } = await admin
        .from("agents")
        .select(
          "id, slug, department_id, is_active, deleted_at, name, description, system_prompt",
        )
        .eq("organization_id", organizationId)
        .like("source_origin", "claude-for-legal:%");
      if (error || !data) return [];
      return data.map((row) => ({
        id: row.id as string,
        slug: row.slug as string,
        departmentId: (row.department_id as string | null) ?? null,
        isFiltered: row.deleted_at !== null || row.is_active === false,
        name: (row.name as string | null) ?? "",
        description: (row.description as string | null) ?? null,
        systemPrompt: (row.system_prompt as string | null) ?? null,
      }));
    },

    async resolveDepartmentIds(
      organizationId: string,
      departmentSlugs: string[],
    ): Promise<Record<string, string>> {
      if (departmentSlugs.length === 0) return {};
      const { data, error } = await admin
        .from("departments")
        .select("id, slug")
        .eq("organization_id", organizationId)
        .in("slug", departmentSlugs);
      if (error || !data) return {};
      const out: Record<string, string> = {};
      for (const dept of data) {
        out[dept.slug as string] = dept.id as string;
      }
      return out;
    },

    async insertAgents(rows: C4LAgentInsert[]): Promise<void> {
      if (rows.length === 0) return;
      const { error } = await admin.from("agents").insert(rows.map(toInsertRow));
      if (error) {
        throw new Error(`C4L agent insert failed: ${error.code ?? "unknown"}`);
      }
    },
  };
}

/**
 * Resolve the organization content imports target. Single-tenant today: the one
 * org (oldest, matching the original CLI's `lookupOrgId`). When the schema
 * becomes truly multi-tenant, this gains an org parameter threaded from the
 * platform-owner's chosen tenant.
 */
export async function resolveContentOrganizationId(): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data.id as string;
}
