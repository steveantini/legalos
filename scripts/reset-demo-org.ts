#!/usr/bin/env tsx
/**
 * Reset the Demo Org to a clean state (Demo access Step 2, Part B).
 *
 * This is the most safety-critical script in the demo-access effort: it runs
 * with the SERVICE-ROLE key, which BYPASSES RLS. A layered guard makes it
 * structurally incapable of touching a real org — see evaluateResetGuard in
 * lib/demo/reset-plan.ts (pure + unit-tested). EVERY guard must pass before any
 * write, and every delete/update is scoped to the validated demo org id.
 *
 * Usage:
 *   npm run reset-demo-org -- --org-id=<demo_org_id>            (soft, default)
 *   npm run reset-demo-org -- --org-id=<demo_org_id> --hard     (nuke + reseed)
 *   npm run reset-demo-org -- --org-id=<demo_org_id> --yes      (skip the prompt)
 *
 * GUARD (all must hold, else ABORT with a clear reason and zero writes):
 *   1. --org-id is explicit (no default, no "find the demo org and nuke it").
 *   2. The org exists AND is_demo = true.
 *   3. The target id != the real org id (oldest is_demo = false).
 *   4. Re-asserted by re-reading is_demo immediately before the destructive block.
 *   5. Unless --yes, the operator types the demo org slug to confirm.
 *   6. Every delete/update is bound to the validated demo org id.
 *
 * SOFT (default): clears accumulated activity (conversations, workflows, usage,
 * attachments, audits, user-created agents) and restores the seeded structure +
 * org-scoped settings (default_model, content_provider_settings, default
 * departments) and the demo users' baseline (super_admin of every demo dept),
 * while KEEPING demo users so existing /demo sessions keep working.
 *
 * HARD (--hard): deletes the demo users and the demo org row (cascading all its
 * data + minted tokens), then re-creates and re-seeds it. Existing demo
 * sign-ins/tokens are invalidated; the operator re-mints.
 *
 * connection_policy is intentionally NOT reset: it is a GLOBAL singleton (one
 * row, no organization_id), so writing it would affect the real org too, which
 * this script must never do. (A follow-up should make connection_policy
 * org-scoped before exposing the demo to untrusted prospects.)
 *
 * Both modes only READ the real org (via seed_demo_org_structure) and only
 * WRITE the validated demo org.
 *
 * Requirements: migrations 0064 + 0065 applied; a seeded Demo Org;
 * SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in .env.local.
 */

import { resolve } from "node:path";
import { stdin, stdout } from "node:process";
import * as readline from "node:readline/promises";

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

import {
  buildResetDeletes,
  evaluateResetGuard,
  type OrgRow,
} from "@/lib/demo/reset-plan";

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

function parseArgs(): { orgId: string | undefined; hard: boolean; yes: boolean } {
  let orgId: string | undefined;
  let hard = false;
  let yes = false;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--org-id=")) orgId = arg.slice("--org-id=".length);
    if (arg === "--hard") hard = true;
    if (arg === "--yes") yes = true;
  }
  return { orgId, hard, yes };
}

function abort(reason: string): never {
  console.error(`ABORT: ${reason}`);
  process.exit(1);
}

/** Resolve the real org (oldest is_demo = false). READ-ONLY. */
async function resolveRealOrgId(supabase: ServiceClient): Promise<string | null> {
  const { data } = await supabase
    .from("organizations")
    .select("id")
    .eq("is_demo", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function loadOrg(
  supabase: ServiceClient,
  id: string,
): Promise<OrgRow | null> {
  const { data } = await supabase
    .from("organizations")
    .select("id, is_demo, slug")
    .eq("id", id)
    .maybeSingle();
  return (data as OrgRow | null) ?? null;
}

/** Restore the org-scoped settings a demo super_admin can change. */
async function restoreBaselineSettings(
  supabase: ServiceClient,
  demoOrgId: string,
): Promise<void> {
  // Org default model → null (falls back to the canonical system default).
  await supabase
    .from("organizations")
    .update({ default_model: null } as never)
    .eq("id", demoOrgId);

  // Vendor content providers → default (absence of a row means enabled).
  await supabase
    .from("content_provider_settings")
    .delete()
    .eq("organization_id", demoOrgId);

  // Default departments for new users → baseline (commercial + general-tools).
  await supabase
    .from("organization_default_departments")
    .delete()
    .eq("organization_id", demoOrgId);
  const { data: baselineDepts } = await supabase
    .from("departments")
    .select("id, slug")
    .eq("organization_id", demoOrgId)
    .in("slug", ["commercial", "general-tools"]);
  const rows = ((baselineDepts ?? []) as Array<{ id: string }>).map((d) => ({
    organization_id: demoOrgId,
    department_id: d.id,
  }));
  if (rows.length > 0) {
    await supabase
      .from("organization_default_departments")
      .insert(rows as never);
  }
}

/** Re-grant every demo user super_admin + dept_admin on every demo department. */
async function restoreDemoUsers(
  supabase: ServiceClient,
  demoOrgId: string,
): Promise<void> {
  const { data: usersData } = await supabase
    .from("users")
    .select("id")
    .eq("organization_id", demoOrgId);
  const userIds = ((usersData ?? []) as Array<{ id: string }>).map((u) => u.id);
  if (userIds.length === 0) return;

  await supabase
    .from("users")
    .update({ role: "super_admin", is_active: true } as never)
    .eq("organization_id", demoOrgId);

  const { data: deptData } = await supabase
    .from("departments")
    .select("id")
    .eq("organization_id", demoOrgId)
    .is("deleted_at", null);
  const deptIds = ((deptData ?? []) as Array<{ id: string }>).map((d) => d.id);

  await supabase
    .from("user_department_roles")
    .delete()
    .in("user_id", userIds);
  const grants = userIds.flatMap((uid) =>
    deptIds.map((did) => ({
      user_id: uid,
      department_id: did,
      role: "dept_admin",
    })),
  );
  if (grants.length > 0) {
    await supabase.from("user_department_roles").insert(grants as never);
  }
}

async function softReset(
  supabase: ServiceClient,
  demoOrgId: string,
): Promise<void> {
  console.log("Soft reset: clearing accumulated activity (scoped to the demo org)...");
  for (const del of buildResetDeletes(demoOrgId)) {
    // Every statement is bound to the validated demo org id, by construction.
    let query = supabase
      .from(del.table)
      .delete()
      .eq("organization_id", del.organizationId);
    if (del.createdByNotNull) query = query.not("created_by", "is", null);
    const { error } = await query;
    if (error) abort(`failed clearing ${del.table}: ${error.message}`);
    console.log(`  cleared ${del.table}`);
  }

  console.log("Restoring seeded structure (departments + agents)...");
  const { error: seedErr } = await supabase.rpc(
    "seed_demo_org_structure" as never,
    { p_demo_org_id: demoOrgId } as never,
  );
  if (seedErr) abort(`seed_demo_org_structure failed: ${seedErr.message}`);

  console.log("Restoring org-scoped settings + demo-user baseline...");
  await restoreBaselineSettings(supabase, demoOrgId);
  await restoreDemoUsers(supabase, demoOrgId);

  console.log("");
  console.log("Soft reset complete. Demo users and minted links remain valid.");
  console.log(
    "Note: connection_policy is a GLOBAL singleton and was intentionally not reset (it would affect the real org).",
  );
}

async function hardReset(
  supabase: ServiceClient,
  demoOrgId: string,
): Promise<void> {
  console.log("Hard reset: deleting demo users, the demo org, then re-seeding...");

  // 1. Delete demo users (auth + cascade public.users / dept roles). Required
  //    before deleting the org (users.organization_id is ON DELETE RESTRICT).
  const { data: usersData } = await supabase
    .from("users")
    .select("id")
    .eq("organization_id", demoOrgId);
  for (const u of (usersData ?? []) as Array<{ id: string }>) {
    const { error } = await supabase.auth.admin.deleteUser(u.id);
    if (error) abort(`failed deleting demo user ${u.id}: ${error.message}`);
  }
  console.log(`  deleted ${(usersData ?? []).length} demo user(s)`);

  // 2. Re-assert the target is a demo org immediately before deletion.
  const recheck = await loadOrg(supabase, demoOrgId);
  if (!recheck || recheck.is_demo !== true) {
    abort("re-check failed: target is no longer a demo org. No org deleted.");
  }

  // 3. Delete the demo org (cascades all org-scoped data + minted tokens). The
  //    delete is doubly bound: id = the validated demo id AND is_demo = true.
  const { error: delErr } = await supabase
    .from("organizations")
    .delete()
    .eq("id", demoOrgId)
    .eq("is_demo", true);
  if (delErr) abort(`failed deleting demo org: ${delErr.message}`);
  console.log("  deleted the demo org row");

  // 4. Re-create the Demo Org and re-seed its structure.
  const { data: created, error: createErr } = await supabase
    .from("organizations")
    .insert({ name: "Demo Workspace", slug: "demo", is_demo: true } as never)
    .select("id")
    .single();
  if (createErr || !created) abort(`failed re-creating demo org: ${createErr?.message}`);
  const newDemoOrgId = (created as unknown as { id: string }).id;

  const { error: seedErr } = await supabase.rpc(
    "seed_demo_org_structure" as never,
    { p_demo_org_id: newDemoOrgId } as never,
  );
  if (seedErr) abort(`seed_demo_org_structure failed: ${seedErr.message}`);

  await restoreBaselineSettings(supabase, newDemoOrgId);

  console.log("");
  console.log(`Hard reset complete. New Demo Org id: ${newDemoOrgId}`);
  console.log("Existing demo links were invalidated — mint fresh ones with: npm run mint-demo-token");
}

async function main(): Promise<void> {
  const { orgId, hard, yes } = parseArgs();
  const supabase = createServiceClient();

  // --- Guard, before ANY write ---------------------------------------------
  const realOrgId = await resolveRealOrgId(supabase);
  const org = orgId ? await loadOrg(supabase, orgId) : null;
  const guard = evaluateResetGuard({ orgIdArg: orgId, org, realOrgId });
  if (!guard.ok) abort(guard.reason);

  // Non-null after a passing guard.
  const demoOrgId = (org as OrgRow).id;
  const demoSlug = (org as OrgRow).slug ?? "(no slug)";

  // Interactive confirmation unless --yes.
  if (!yes) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    const answer = await rl.question(
      `About to ${hard ? "HARD-RESET (nuke + reseed)" : "soft-reset"} demo org "${demoSlug}" (${demoOrgId}).\n` +
        `Type the demo org slug ("${demoSlug}") to confirm: `,
    );
    rl.close();
    if (answer.trim() !== demoSlug) abort("confirmation did not match; nothing changed.");
  }

  // Re-assert is_demo immediately before the destructive block (TOCTOU).
  const recheck = await loadOrg(supabase, demoOrgId);
  if (!recheck) {
    abort("pre-destructive re-check failed: target org not found. Nothing changed.");
  }
  if (recheck.id !== demoOrgId || recheck.is_demo !== true) {
    abort("pre-destructive re-check failed: target is not a demo org. Nothing changed.");
  }
  if (realOrgId && recheck.id === realOrgId) {
    abort("pre-destructive re-check failed: target equals the real org id. Nothing changed.");
  }

  if (hard) {
    await hardReset(supabase, demoOrgId);
  } else {
    await softReset(supabase, demoOrgId);
  }
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
