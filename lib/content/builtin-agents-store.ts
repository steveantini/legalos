import "server-only";

import {
  BUILTIN_AGENT_MODEL,
  type ExistingBuiltinAgent,
  type BuiltinAgentInsert,
  type BuiltinAgentUpdate,
  type BuiltinAgentsSeedStore,
} from "@/lib/content/builtin-agents-seed";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Service-role data access for the built-in agent seed (D-180/D-181, brand-decoupled D-182) — the
 * Supabase-backed `BuiltinAgentsSeedStore`. Same custody pattern as the C4L store
 * (`lib/content/c4l-store.ts`): the AUTHORIZATION is the platform-owner gate on
 * whatever triggers a seed; the data op runs service-side, scoped by an explicit
 * `organization_id` filter.
 *
 * Reads/writes are isolated to the built-in tier by `source_origin LIKE
 * 'builtin:%'`, so a C4L refresh and a built-in seed never touch each other's
 * rows. Provided for a future platform-owner refresh button; the one-shot CLI
 * (`scripts/seed-builtin-agents.ts`) uses the same pure planner with its own
 * self-contained client.
 */

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

function toInsertRow(row: BuiltinAgentInsert): AgentInsertRow {
  return {
    organization_id: row.organizationId,
    department_id: row.departmentId,
    slug: row.slug,
    name: row.name,
    description: row.description,
    type: "native",
    model: BUILTIN_AGENT_MODEL,
    system_prompt: row.systemPrompt,
    is_template: true,
    is_active: true,
    created_by: null,
    source_origin: row.sourceOrigin,
    sort_order: row.sortOrder,
    tools_enabled: row.webSearch ? ["web_search"] : [],
    default_output_format: row.defaultOutputFormat,
  };
}

/** Build the service-role-backed built-in agents seed store. */
export function createBuiltinAgentsSeedStore(): BuiltinAgentsSeedStore {
  const admin = createSupabaseAdminClient();

  return {
    async listExistingBuiltinAgents(
      organizationId: string,
    ): Promise<ExistingBuiltinAgent[]> {
      const { data, error } = await admin
        .from("agents")
        .select(
          "id, slug, is_active, deleted_at, name, description, system_prompt, model",
        )
        .eq("organization_id", organizationId)
        .like("source_origin", "builtin:%");
      if (error || !data) return [];
      return data.map((row) => ({
        id: row.id as string,
        slug: row.slug as string,
        isFiltered: row.deleted_at !== null || row.is_active === false,
        name: (row.name as string | null) ?? "",
        description: (row.description as string | null) ?? null,
        systemPrompt: (row.system_prompt as string | null) ?? null,
        model: (row.model as string | null) ?? null,
      }));
    },

    async resolveDepartmentId(
      organizationId: string,
      departmentSlug: string,
    ): Promise<string | null> {
      const { data, error } = await admin
        .from("departments")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("slug", departmentSlug)
        .maybeSingle();
      if (error || !data) return null;
      return data.id as string;
    },

    async insertAgents(rows: BuiltinAgentInsert[]): Promise<void> {
      if (rows.length === 0) return;
      const { error } = await admin.from("agents").insert(rows.map(toInsertRow));
      if (error) {
        throw new Error(`built-in agent insert failed: ${error.code ?? "unknown"}`);
      }
    },

    async updateAgents(rows: BuiltinAgentUpdate[]): Promise<void> {
      for (const row of rows) {
        const { error } = await admin
          .from("agents")
          .update({
            name: row.name,
            description: row.description,
            system_prompt: row.systemPrompt,
            model: row.model,
          })
          .eq("id", row.id);
        if (error) {
          throw new Error(
            `built-in agent update failed (${row.slug}): ${error.code ?? "unknown"}`,
          );
        }
      }
    },
  };
}
