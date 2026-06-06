#!/usr/bin/env tsx
/**
 * Seed the starter workflow templates (Workflows arc Step 5).
 *
 * Usage:
 *   npm run seed-workflow-templates
 *
 * Requirements:
 *   - Migration 0063_workflow_templates.sql applied (status 'template' +
 *     template_slug on workflow_definitions).
 *   - SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL set in .env.local
 *     (the script loads via dotenv).
 *
 * Behavior:
 *   - Takes the template SPECS from lib/workflows/templates.ts (the single
 *     source of truth; pure + unit-tested) and resolves each referenced agent
 *     by its stable SLUG against the org's live agents (active, native) —
 *     never by hardcoded UUID, so the seed is portable to whatever the org's
 *     real agent rows are.
 *   - A template whose agent is missing is SKIPPED with a report, never
 *     seeded broken. Each resolved definition is checked with the real
 *     validateWorkflowDefinition before writing.
 *   - IDEMPOTENT: rows are keyed on (organization_id, template_slug) — a
 *     re-run updates the existing row in place (inserted / updated / skipped
 *     reported per template, plus a summary). Exits 0 on success, 1 on any
 *     hard failure.
 *
 * Like the C4L import, this runs with the service role (templates are
 * platform-seeded content, org-scoped on write). It never touches runs,
 * forks, or any non-template workflow_definitions row.
 */

import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

import {
  STARTER_WORKFLOW_TEMPLATES,
  resolveTemplateSteps,
  type WorkflowTemplateSpec,
} from "@/lib/workflows/templates";
import { validateWorkflowDefinition } from "@/lib/workflows/validate";

config({ path: resolve(process.cwd(), ".env.local") });

// ---------------------------------------------------------------------------
// Supabase (mirrors scripts/import-c4l-plugin.ts conventions)
// ---------------------------------------------------------------------------

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

async function lookupOrgId(supabase: ServiceClient): Promise<string> {
  const { data, error } = await supabase
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (error || !data) {
    console.error("Error looking up organization:", error);
    process.exit(1);
  }
  return (data as { id: string }).id;
}

/** Resolve the org's runnable agents for every slug the specs reference. */
async function lookupAgentIdsBySlug(
  supabase: ServiceClient,
  orgId: string,
  slugs: string[],
): Promise<Map<string, string>> {
  if (slugs.length === 0) return new Map();
  const { data, error } = await supabase
    .from("agents")
    .select("id, slug")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .eq("type", "native")
    .in("slug", slugs);
  if (error) {
    console.error("Error looking up agents:", error);
    process.exit(1);
  }
  return new Map(
    ((data ?? []) as Array<{ id: string; slug: string }>).map((a) => [a.slug, a.id]),
  );
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

type SeedOutcome = "inserted" | "updated" | "skipped" | "failed";

async function seedTemplate(
  supabase: ServiceClient,
  orgId: string,
  spec: WorkflowTemplateSpec,
  agentIdBySlug: Map<string, string>,
): Promise<{ outcome: SeedOutcome; detail?: string }> {
  const resolved = resolveTemplateSteps(spec, agentIdBySlug);
  if (!resolved.ok) {
    return {
      outcome: "skipped",
      detail: `missing agent(s): ${resolved.missingAgentSlugs.join(", ")}`,
    };
  }

  // Belt and suspenders: the same gate the engine and the builder apply.
  const resolvedIds = new Set(agentIdBySlug.values());
  const validation = await validateWorkflowDefinition(
    { steps: resolved.steps },
    {
      isAgentRunnable: async (agentId) => resolvedIds.has(agentId),
      classifyTool: async () => null, // starter templates carry no tool steps
    },
  );
  if (!validation.ok) {
    return { outcome: "failed", detail: validation.errors.join(" ") };
  }

  const row = {
    organization_id: orgId,
    department_id: null,
    name: spec.name,
    description: spec.description,
    status: "template",
    template_slug: spec.slug,
    definition: { steps: resolved.steps },
    created_by: null,
  };

  // Select-then-write (not a blind upsert) so the report distinguishes
  // inserted from updated.
  const { data: existing, error: selectErr } = await supabase
    .from("workflow_definitions")
    .select("id")
    .eq("organization_id", orgId)
    .eq("template_slug", spec.slug)
    .maybeSingle();
  if (selectErr) {
    return { outcome: "failed", detail: selectErr.message };
  }

  if (existing) {
    const { error } = await supabase
      .from("workflow_definitions")
      .update(row as never)
      .eq("id", (existing as { id: string }).id);
    if (error) return { outcome: "failed", detail: error.message };
    return { outcome: "updated" };
  }

  const { error } = await supabase
    .from("workflow_definitions")
    .insert(row as never);
  if (error) return { outcome: "failed", detail: error.message };
  return { outcome: "inserted" };
}

async function main(): Promise<void> {
  const supabase = createServiceClient();
  const orgId = await lookupOrgId(supabase);

  const slugs = [
    ...new Set(
      STARTER_WORKFLOW_TEMPLATES.flatMap((spec) =>
        spec.steps.filter((s) => s.type === "agent").map((s) => s.agentSlug),
      ),
    ),
  ];
  const agentIdBySlug = await lookupAgentIdsBySlug(supabase, orgId, slugs);

  console.log(`Seeding ${STARTER_WORKFLOW_TEMPLATES.length} workflow templates…`);
  const counts: Record<SeedOutcome, number> = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };

  for (const spec of STARTER_WORKFLOW_TEMPLATES) {
    const { outcome, detail } = await seedTemplate(
      supabase,
      orgId,
      spec,
      agentIdBySlug,
    );
    counts[outcome] += 1;
    const marker =
      outcome === "inserted"
        ? "+ inserted"
        : outcome === "updated"
          ? "~ updated "
          : outcome === "skipped"
            ? "- skipped "
            : "✗ failed  ";
    console.log(`  ${marker}  ${spec.slug}${detail ? `  (${detail})` : ""}`);
  }

  console.log(
    `Done: ${counts.inserted} inserted, ${counts.updated} updated, ${counts.skipped} skipped, ${counts.failed} failed.`,
  );
  process.exit(counts.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
