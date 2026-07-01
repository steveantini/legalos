#!/usr/bin/env tsx
/**
 * Seed the renewal-watcher FIXTURE (watcher arc, Stage 2, D-221).
 *
 * Usage:
 *   npm run seed-renewal-watcher-fixture                       (the real org: oldest)
 *   npm run seed-renewal-watcher-fixture -- --org-id=<org_id>  (a specific org)
 *
 * Stands up, idempotently, everything the renewal watcher needs to run against
 * REAL-SHAPED but obviously-fictional data:
 *   - a clearly-named FIXTURE collection (the isolation boundary — there is no
 *     is_fixture column on collections/extractions, so a named fixture collection
 *     is how sample data stays separable; see the sweep note below),
 *   - a fixture connection + documents + a document kind (expiration_date: date,
 *     auto_renew: boolean) + extracted values, with fictional entity names
 *     (Acme / Bellini / Maddox / Globex / Initech),
 *   - an ACTIVE "Renewal watcher (fixture)" workflow_definition forked from the
 *     RENEWAL_WATCHER_TEMPLATE spec (the template→fork spine; validated with the
 *     real validator), and
 *   - a workflow_schedules row (owner = the org's first super_admin, option 2c)
 *     that the Stage-1 cron will claim and run.
 *
 * SWEEPABLE (decision 3ii): findings the watcher writes carry is_fixture=true
 * (delete from watcher_findings where is_fixture). The seeded agreements live in
 * the named fixture collection, isolatable and deletable as a unit. This seed
 * writes NOTHING outside the fixture collection + the fixture watcher/schedule.
 *
 * IDEMPOTENT + REPLAY-SAFE: every entity is select-then-insert (or upsert) keyed
 * on a stable marker, so a re-run never duplicates. Expiry dates are recomputed
 * relative to "now" on each run, so the fixtures stay "expiring soon" — the value
 * refreshes, the rows do not multiply.
 *
 * Operator-run only (service role, from .env.local). NOT wired into any app path.
 */

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

import { isNativeAction } from "@/lib/workflows/native-actions-shared";
import { RENEWAL_WATCHER_TEMPLATE, resolveTemplateSteps } from "@/lib/workflows/templates";
import { validateWorkflowDefinition } from "@/lib/workflows/validate";

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
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function parseArgs(argv: string[]): { orgId: string | undefined } {
  let orgId: string | undefined;
  for (const arg of argv) {
    if (arg.startsWith("--org-id=")) {
      const value = arg.slice("--org-id=".length).trim();
      orgId = value.length > 0 ? value : undefined;
    }
  }
  return { orgId };
}

async function resolveOrgId(supabase: ServiceClient, orgIdArg: string | undefined): Promise<string> {
  if (orgIdArg) {
    const { data, error } = await supabase
      .from("organizations")
      .select("id")
      .eq("id", orgIdArg)
      .maybeSingle();
    if (error || !data) {
      console.error(`Error: no organization found for --org-id=${orgIdArg}.`, error ?? "");
      process.exit(1);
    }
    return (data as { id: string }).id;
  }
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

async function resolveOwnerUserId(supabase: ServiceClient, orgId: string): Promise<string> {
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("organization_id", orgId)
    .eq("role", "super_admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    console.error("Error: the org has no super_admin to own the watcher schedule.", error ?? "");
    process.exit(1);
  }
  return (data as { id: string }).id;
}

/** Select-then-insert on a stable match; returns the row id. */
async function ensureId(
  supabase: ServiceClient,
  table: string,
  match: Record<string, unknown>,
  insert: Record<string, unknown>,
): Promise<string> {
  let query = supabase.from(table).select("id");
  for (const [k, v] of Object.entries(match)) query = query.eq(k, v as never);
  const { data: existing, error: selErr } = await query.maybeSingle();
  if (selErr) throw new Error(`${table} select failed: ${selErr.message}`);
  if (existing) return (existing as { id: string }).id;
  const { data: inserted, error: insErr } = await supabase
    .from(table)
    .insert(insert as never)
    .select("id")
    .single();
  if (insErr || !inserted) throw new Error(`${table} insert failed: ${insErr?.message}`);
  return (inserted as { id: string }).id;
}

const FIXTURE_COLLECTION_NAME = "Fixture: expiring agreements (sample data)";
const FIXTURE_PROVIDER_ID = "fixture-renewal-watcher";
const FIXTURE_WORKFLOW_NAME = "Renewal watcher (fixture)";
const WINDOW_DAYS = 60;
// Test-friendly cadence: 900s (15 min) matches the cron granularity, so the
// operator sees findings on the first tick after enabling the cron. Idempotent
// upserts make re-scans free; real watchers set a daily+ cadence via Stage 3.
const CADENCE_SECONDS = 900;

/** Obviously-fictional agreements: three expiring within the window, two outside. */
const FIXTURE_AGREEMENTS = [
  { externalId: "fixture-agreement-acme", title: "Acme Corp Master Services Agreement", offsetDays: 15, autoRenew: false },
  { externalId: "fixture-agreement-bellini", title: "Bellini Holdings NDA", offsetDays: 45, autoRenew: true },
  { externalId: "fixture-agreement-maddox", title: "Maddox Legal Retainer", offsetDays: 5, autoRenew: false },
  { externalId: "fixture-agreement-globex", title: "Globex Vendor Agreement", offsetDays: 200, autoRenew: false },
  { externalId: "fixture-agreement-initech", title: "Initech Statement of Work", offsetDays: -30, autoRenew: false },
];

function isoDate(base: Date, offsetDays: number): string {
  return new Date(base.getTime() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const supabase = createServiceClient();
  const { orgId: orgIdArg } = parseArgs(process.argv.slice(2));
  const orgId = await resolveOrgId(supabase, orgIdArg);
  const ownerUserId = await resolveOwnerUserId(supabase, orgId);
  const now = new Date();
  const nowIso = now.toISOString();
  console.log(`Target org: ${orgId} (owner ${ownerUserId}).`);

  // 1. Fixture connection (documents + sources need a connection_id).
  const connectionId = await ensureId(
    supabase,
    "connections",
    { organization_id: orgId, provider_id: FIXTURE_PROVIDER_ID },
    {
      organization_id: orgId,
      provider_id: FIXTURE_PROVIDER_ID,
      capability_category: "file-storage",
      scope: "org",
      status: "active",
      provider_account_label: "Fixture sample data (not a real connection)",
    },
  );

  // 2. Fixture collection (the isolation boundary).
  const collectionId = await ensureId(
    supabase,
    "collections",
    { organization_id: orgId, name: FIXTURE_COLLECTION_NAME },
    {
      organization_id: orgId,
      name: FIXTURE_COLLECTION_NAME,
      description: "Sample agreements for the renewal watcher fixture. Not real data.",
      visibility: "org",
    },
  );

  // 3. Fixture collection source (a folder within the fixture connection).
  const sourceId = await ensureId(
    supabase,
    "collection_sources",
    { collection_id: collectionId, root_reference: "fixture:agreements" },
    {
      collection_id: collectionId,
      connection_id: connectionId,
      root_reference: "fixture:agreements",
      display_path: "Fixture sample data / Agreements",
      recursive: true,
    },
  );

  // 4. The document kind: expiration_date (date) + auto_renew (boolean).
  const schemaId = await ensureId(
    supabase,
    "collection_schemas",
    { collection_id: collectionId },
    {
      collection_id: collectionId,
      organization_id: orgId,
      name: "Agreements",
      attributes: [
        { key: "expiration_date", label: "Expiration date", type: "date", description: "The date the agreement expires." },
        { key: "auto_renew", label: "Auto renew", type: "boolean", description: "Whether the agreement renews automatically." },
      ],
      version: 1,
    },
  );

  // 5. Fixture documents + inventory + extracted values.
  let agreements = 0;
  const extractionRows: Record<string, unknown>[] = [];
  for (const a of FIXTURE_AGREEMENTS) {
    const documentId = await ensureId(
      supabase,
      "documents",
      { organization_id: orgId, connection_id: connectionId, external_id: a.externalId },
      {
        organization_id: orgId,
        connection_id: connectionId,
        external_id: a.externalId,
        title: a.title,
        mime_type: "application/pdf",
        modified_at_source: nowIso,
      },
    );
    await ensureId(
      supabase,
      "collection_documents",
      { collection_source_id: sourceId, external_id: a.externalId },
      {
        collection_id: collectionId,
        collection_source_id: sourceId,
        external_id: a.externalId,
        document_id: documentId,
        title: a.title,
        mime_type: "application/pdf",
        status: "present",
        modified_at_source: nowIso,
      },
    );
    const expiry = isoDate(now, a.offsetDays);
    const common = {
      organization_id: orgId,
      source_collection_schema_id: schemaId,
      found: true,
      citation_verified: true,
      source_read_incomplete: false,
      extracted_at: nowIso,
      extracted_against_schema_version: 1,
      extracted_model_id: "fixture",
      document_modified_at_source: nowIso,
    };
    extractionRows.push(
      {
        ...common,
        document_id: documentId,
        attribute_key: "expiration_date",
        attribute_type: "date",
        value_text: expiry,
        value_date: expiry,
        citation_excerpt: `This agreement expires on ${expiry}.`,
      },
      {
        ...common,
        document_id: documentId,
        attribute_key: "auto_renew",
        attribute_type: "boolean",
        value_text: a.autoRenew ? "yes" : "no",
        value_boolean: a.autoRenew,
        citation_excerpt: a.autoRenew ? "This agreement renews automatically." : "This agreement does not auto-renew.",
      },
    );
    agreements += 1;
  }
  // Upsert extractions (idempotent + value-refreshing) on (document_id, attribute_key).
  const { error: exErr } = await supabase
    .from("document_extractions")
    .upsert(extractionRows as never, { onConflict: "document_id,attribute_key" });
  if (exErr) {
    console.error("Error upserting fixture extractions:", exErr.message);
    process.exit(1);
  }

  // 6. The ACTIVE watcher definition, forked from the template spec (no agent
  //    slugs; validated with the real validator, native tool classified read).
  const resolved = resolveTemplateSteps(RENEWAL_WATCHER_TEMPLATE, new Map());
  if (!resolved.ok) {
    console.error("Error: the renewal-watcher template did not resolve:", resolved.missingAgentSlugs);
    process.exit(1);
  }
  const validation = await validateWorkflowDefinition(
    { steps: resolved.steps },
    {
      isAgentRunnable: async () => false, // no agent steps
      classifyTool: async (serverId, toolName) => (isNativeAction(serverId, toolName) ? "read" : null),
    },
  );
  if (!validation.ok) {
    console.error("Error: the watcher definition failed validation:", validation.errors.join(" "));
    process.exit(1);
  }
  const definitionId = await ensureId(
    supabase,
    "workflow_definitions",
    { organization_id: orgId, name: FIXTURE_WORKFLOW_NAME },
    {
      organization_id: orgId,
      department_id: null,
      name: FIXTURE_WORKFLOW_NAME,
      description: RENEWAL_WATCHER_TEMPLATE.description,
      status: "active",
      template_slug: null,
      definition: { steps: resolved.steps },
      created_by: ownerUserId,
    },
  );

  // 7. The schedule the Stage-1 cron will claim + run.
  const scheduleId = await ensureId(
    supabase,
    "workflow_schedules",
    { organization_id: orgId, workflow_definition_id: definitionId },
    {
      organization_id: orgId,
      workflow_definition_id: definitionId,
      owner_user_id: ownerUserId,
      enabled: true,
      next_run_at: nowIso,
      cadence_seconds: CADENCE_SECONDS,
      autonomy_level: "supervised",
      run_input: {
        findingKind: "renewal",
        windowDays: WINDOW_DAYS,
        collectionId,
        isFixture: true,
      },
    },
  );

  console.log(
    `Done: ${agreements} fixture agreements in collection ${collectionId}; ` +
      `watcher definition ${definitionId}; schedule ${scheduleId} (cadence ${CADENCE_SECONDS}s, window ${WINDOW_DAYS}d).`,
  );
  console.log(
    "The watcher runs on the next cron tick once CRON_SECRET is set in the Vercel env. " +
      "Sweep fixtures with: delete from watcher_findings where is_fixture;",
  );
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
