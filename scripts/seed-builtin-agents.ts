#!/usr/bin/env tsx
/**
 * Seed the six built-in agents (D-181, D-186) into General Tools.
 *
 * Usage:
 *   npm run seed-builtin-agents
 *
 * Requirements:
 *   - SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in .env.local.
 *
 * Behavior:
 *   - Resolves the DEPLOYMENT org (oldest, is_demo = false) AND the demo org
 *     (is_demo = true, if present), and seeds each. Idempotent on
 *     (organization_id, slug): a re-run INSERTS only new agents and UPDATES
 *     existing canonical rows in place (name / description / system_prompt /
 *     model), which is how a prompt tweak ships post-dogfooding. Soft-deleted
 *     rows are never resurrected; rows outside `source_origin LIKE 'builtin:%'`
 *     (Claude for Legal, user forks) are never touched.
 *   - The agent definitions and prompts are version-controlled in
 *     `lib/content/builtin-agents-seed.ts`; this script only wires a service client to
 *     the pure planner/executor. Re-run this command to push a prompt edit.
 *
 * (The demo org also receives these rows via demo-org.sql's copy-all-agents step
 * on any future demo reset, by the same (org, slug) identity, so the two paths
 * converge.)
 */

import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

import {
  BUILTIN_AGENT_MODEL,
  builtinToolsEnabled,
  seedBuiltinAgents,
  type ExistingBuiltinAgent,
  type BuiltinAgentInsert,
  type BuiltinAgentUpdate,
  type BuiltinAgentsSeedStore,
} from "../lib/content/builtin-agents-seed";

config({ path: resolve(process.cwd(), ".env.local") });

type ServiceClient = ReturnType<typeof createClient>;

function createServiceClient(): ServiceClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Error: SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL must be set in .env.local.",
    );
    process.exit(1);
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** A BuiltinAgentsSeedStore backed by the CLI's service client (same logic as builtin-agents-store.ts). */
function createCliStore(supabase: ServiceClient): BuiltinAgentsSeedStore {
  return {
    async listExistingBuiltinAgents(
      organizationId: string,
    ): Promise<ExistingBuiltinAgent[]> {
      const { data, error } = await supabase
        .from("agents")
        .select(
          "id, slug, is_active, deleted_at, name, description, system_prompt, model",
        )
        .eq("organization_id", organizationId)
        .like("source_origin", "builtin:%");
      if (error || !data) return [];
      return (data as Record<string, unknown>[]).map((row) => ({
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
      const { data, error } = await supabase
        .from("departments")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("slug", departmentSlug)
        .maybeSingle();
      if (error || !data) return null;
      return (data as { id: string }).id;
    },

    async insertAgents(rows: BuiltinAgentInsert[]): Promise<void> {
      if (rows.length === 0) return;
      const payload = rows.map((row) => ({
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
        tools_enabled: builtinToolsEnabled(row),
        default_output_format: row.defaultOutputFormat,
      }));
      const { error } = await supabase
        .from("agents")
        .insert(payload as unknown as never);
      if (error) throw new Error(`insert failed: ${error.message}`);
    },

    async updateAgents(rows: BuiltinAgentUpdate[]): Promise<void> {
      for (const row of rows) {
        const { error } = await supabase
          .from("agents")
          .update({
            name: row.name,
            description: row.description,
            system_prompt: row.systemPrompt,
            model: row.model,
          } as unknown as never)
          .eq("id", row.id);
        if (error) throw new Error(`update failed (${row.slug}): ${error.message}`);
      }
    },
  };
}

type OrgRow = { id: string; name: string; is_demo: boolean };

async function lookupTargetOrgs(supabase: ServiceClient): Promise<OrgRow[]> {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, is_demo")
    .order("created_at", { ascending: true });
  if (error || !data) {
    console.error("Error looking up organizations:", error);
    process.exit(1);
  }
  const orgs = data as OrgRow[];
  const deployment = orgs.find((o) => o.is_demo === false);
  const demo = orgs.find((o) => o.is_demo === true);
  const targets: OrgRow[] = [];
  if (deployment) targets.push(deployment);
  if (demo) targets.push(demo);
  if (targets.length === 0) {
    console.error("Error: no organizations found to seed.");
    process.exit(1);
  }
  return targets;
}

async function main() {
  const supabase = createServiceClient();
  const store = createCliStore(supabase);
  const targets = await lookupTargetOrgs(supabase);

  let failed = false;
  for (const org of targets) {
    const tier = org.is_demo ? "demo" : "deployment";
    console.log(`\nSeeding "${org.name}" (${tier} org)...`);
    try {
      const result = await seedBuiltinAgents({
        organizationId: org.id,
        store,
      });
      if (result.missingDepartment) {
        console.warn("  ! skipped: no General Tools department in this org.");
        failed = true;
        continue;
      }
      console.log(
        `  inserted ${result.insertedCount}, updated ${result.updatedCount}, ` +
          `unchanged ${result.unchangedCount}, skipped-filtered ${result.skippedFiltered.length}`,
      );
    } catch (err) {
      console.error(`  ✗ failed: ${(err as Error).message}`);
      failed = true;
    }
  }

  console.log("");
  if (failed) process.exit(1);
  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
