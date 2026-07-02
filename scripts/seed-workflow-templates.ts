#!/usr/bin/env tsx
/**
 * Seed the starter workflow templates (Workflows arc Step 5).
 *
 * Usage:
 *   npm run seed-workflow-templates                       (the real org: oldest)
 *   npm run seed-workflow-templates -- --org-id=<org_id>  (a specific org)
 *
 * The optional --org-id targets one organization (e.g. the Demo Org) instead of
 * the default oldest org. Template agents resolve by slug against that SAME org,
 * so the gallery lands wired to the target org's agents. Omitting the flag keeps
 * the original behavior exactly.
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
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

import {
  STARTER_WORKFLOW_TEMPLATES,
  classifyStarterTemplateTool,
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

/**
 * Parse the script's CLI args. The only flag is `--org-id=<id>`, which targets a
 * specific organization; omitted, the script keeps its original behavior (seed
 * the oldest org). Pure and exported so the parse is unit-tested without running
 * the seed. An empty or whitespace-only `--org-id=` is treated as absent.
 */
export function parseSeedTemplateArgs(argv: string[]): {
  orgId: string | undefined;
} {
  let orgId: string | undefined;
  for (const arg of argv) {
    if (arg.startsWith("--org-id=")) {
      const value = arg.slice("--org-id=".length).trim();
      orgId = value.length > 0 ? value : undefined;
    }
  }
  return { orgId };
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

/**
 * Verify an explicitly-passed --org-id exists before seeding. An unknown org
 * would resolve zero agents and silently skip every template, so fail loudly
 * instead. (No is_demo gate: the flag intentionally seeds ANY org.)
 */
async function resolveExplicitOrgId(
  supabase: ServiceClient,
  orgId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", orgId)
    .maybeSingle();
  if (error) {
    console.error("Error looking up organization:", error);
    process.exit(1);
  }
  if (!data) {
    console.error(`Error: no organization found for --org-id=${orgId}.`);
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
      // Native actions classify "read" (the renewal watcher's scan step, D-224);
      // anything else stays unknown — starter templates carry no MCP tool steps,
      // and an MCP-referencing spec should fail here rather than seed broken.
      classifyTool: classifyStarterTemplateTool,
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
  const { orgId: orgIdArg } = parseSeedTemplateArgs(process.argv.slice(2));
  const orgId = orgIdArg
    ? await resolveExplicitOrgId(supabase, orgIdArg)
    : await lookupOrgId(supabase);
  console.log(
    orgIdArg
      ? `Target org: ${orgId} (from --org-id).`
      : `Target org: ${orgId} (default: oldest organization).`,
  );

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

// Run only when invoked as a script (tsx), not when imported by a unit test —
// the arg parser above is exported for testing, and importing this module must
// not open a Supabase connection or seed anything.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
