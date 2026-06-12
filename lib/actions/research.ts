"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  getCurrentUserProfile,
  isCurrentUserSuperAdmin,
  requireAuthUser,
} from "@/lib/auth/access";
import { getVisibleCollections } from "@/lib/knowledge/collections-data";
import {
  advanceResearchRun,
  type AdvanceResult,
} from "@/lib/knowledge/research/engine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server actions for the Research surface (Knowledge arc Step 2). The
 * client-driven loop idiom: start creates the run row, then the owner's
 * browser advances it one bounded segment per call (the same shape as the
 * collection sync loop), so a 200-document sweep never pins a request.
 *
 * GUARDRAILS enforced here, honestly surfaced: the per-org CONCURRENCY cap
 * (starting beyond it declines politely, never queues silently), and
 * advancing/cancelling is OWNER-ONLY (admins read runs, they don't drive
 * them). The per-run DOCUMENT cap is enforced inside the engine at
 * enumeration, where the live count is known.
 */

const RESEARCH_PATH = "/workspace/knowledge/research";
const GENERIC_ERROR = "Something went wrong. Please try again.";

/** Concurrent non-terminal runs allowed per organization. */
const CONCURRENT_RUNS_PER_ORG = 2;
/** A non-terminal run untouched this long no longer counts toward the cap
 * (an abandoned browser must not block the org; the run stays resumable). */
const STALE_RUN_MINUTES = 30;

const startSchema = z.object({
  question: z.string().trim().min(8, "Ask a fuller question.").max(600),
  collectionIds: z.array(z.string().uuid()).min(1).max(20),
});

const runIdSchema = z.string().uuid();

/** Create a run over the chosen collections. The engine plans on first advance. */
export async function startResearchRun(input: {
  question: string;
  collectionIds: string[];
}): Promise<{ ok: true; runId: string } | { ok: false; error: string }> {
  const user = await requireAuthUser();
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the question and scope.",
    };
  }

  const profile = await getCurrentUserProfile();
  if (!profile?.organization_id) return { ok: false, error: GENERIC_ERROR };

  // Scope = the intersection of the request with the user's RLS-visible
  // collections: a collection the user can't see can never enter a run.
  const visible = await getVisibleCollections();
  const selected = visible.filter((c) => parsed.data.collectionIds.includes(c.id));
  if (selected.length === 0) {
    return { ok: false, error: "Pick at least one collection you can see." };
  }

  // The per-org concurrency cap. Service-role count on purpose: the cap is
  // organizational, and a plain user's RLS view can't see other members'
  // runs. Stale runs (no progress for 30 minutes; e.g. a closed laptop)
  // don't block the org — they stay resumable but uncounted.
  const admin = createSupabaseAdminClient();
  const staleBefore = new Date(
    Date.now() - STALE_RUN_MINUTES * 60_000,
  ).toISOString();
  const { count } = await admin
    .from("research_runs")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", profile.organization_id)
    .in("status", ["planning", "running", "synthesizing"])
    .gt("updated_at", staleBefore);
  if ((count ?? 0) >= CONCURRENT_RUNS_PER_ORG) {
    return {
      ok: false,
      error: `${CONCURRENT_RUNS_PER_ORG} research runs are already in progress for your organization. Wait for one to finish, or cancel one, then try again.`,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("research_runs")
    .insert({
      organization_id: profile.organization_id,
      user_id: user.id,
      question: parsed.data.question,
      scope: selected.map((c) => ({
        id: c.id,
        name: c.name,
        provenance: c.sources.map((s) => s.displayPath),
      })),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: GENERIC_ERROR };

  revalidatePath(RESEARCH_PATH);
  return { ok: true, runId: (data as { id: string }).id };
}

/** Advance the run one bounded segment (owner only; the client loops). */
export async function advanceResearchRunAction(
  runId: string,
): Promise<{ ok: true; result: AdvanceResult } | { ok: false; error: string }> {
  const user = await requireAuthUser();
  if (!runIdSchema.safeParse(runId).success) {
    return { ok: false, error: GENERIC_ERROR };
  }

  // Owner-only: admins can READ runs (0071), but only the asker drives one —
  // the engine's writes run under the owner-write policies as them.
  const supabase = await createSupabaseServerClient();
  const { data: runRow } = await supabase
    .from("research_runs")
    .select("user_id")
    .eq("id", runId)
    .maybeSingle();
  if (!runRow) return { ok: false, error: "This run isn't available." };
  if ((runRow as { user_id: string }).user_id !== user.id) {
    return { ok: false, error: "Only the person who started a run can advance it." };
  }

  try {
    const result = await advanceResearchRun(runId);
    if (!result) return { ok: false, error: "This run isn't available." };
    if (
      result.status === "completed" ||
      result.status === "failed" ||
      result.status === "cancelled"
    ) {
      revalidatePath(RESEARCH_PATH);
    }
    return { ok: true, result };
  } catch (err) {
    console.error("advanceResearchRun threw", err);
    return {
      ok: false,
      error:
        "The run hit a problem and paused. Nothing was lost; advance it again to resume.",
    };
  }
}

/** Cancel a run (owner only); partial findings remain visible. */
export async function cancelResearchRun(
  runId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAuthUser();
  if (!runIdSchema.safeParse(runId).success) {
    return { ok: false, error: GENERIC_ERROR };
  }
  // The owner-write RLS policy is the gate: a non-owner's update matches no
  // rows and changes nothing.
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("research_runs")
    .update({ status: "cancelled" })
    .eq("id", runId)
    .in("status", ["planning", "running", "synthesizing"]);
  if (error) return { ok: false, error: GENERIC_ERROR };
  revalidatePath(RESEARCH_PATH);
  return { ok: true };
}

/**
 * Delete a run (the asker their own; org/super admins any of the org's,
 * mirroring read visibility — the 0072 admin-delete policy is the DB half of
 * this gate). Findings cascade with the run; usage_events SURVIVE with
 * research_run_id nulled (cost records are accounting facts). Non-terminal
 * runs decline honestly: cancel first, then delete.
 */
export async function deleteResearchRun(
  runId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAuthUser();
  if (!runIdSchema.safeParse(runId).success) {
    return { ok: false, error: GENERIC_ERROR };
  }

  const supabase = await createSupabaseServerClient();
  const { data: runRow } = await supabase
    .from("research_runs")
    .select("user_id, status")
    .eq("id", runId)
    .maybeSingle();
  if (!runRow) return { ok: false, error: "This run isn't available." };

  const row = runRow as { user_id: string; status: string };
  if (["planning", "running", "synthesizing"].includes(row.status)) {
    return {
      ok: false,
      error: "This run is still in progress. Cancel it first, then delete it.",
    };
  }

  // App-layer half of the double-gate: owner, or org/super admin.
  if (row.user_id !== user.id) {
    const profile = await getCurrentUserProfile();
    const role = profile?.role as string | undefined;
    if (role !== "super_admin" && role !== "org_admin") {
      return { ok: false, error: "You can only delete your own runs." };
    }
  }

  const { error } = await supabase
    .from("research_runs")
    .delete()
    .eq("id", runId);
  if (error) return { ok: false, error: GENERIC_ERROR };

  revalidatePath(RESEARCH_PATH);
  return { ok: true };
}

const capSchema = z.object({
  cap: z.number().int().min(1).max(5000),
});

/** Update the per-run document cap (super admin; Policy & access). */
export async function updateResearchDocumentCap(input: {
  cap: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAuthUser();
  if (!(await isCurrentUserSuperAdmin())) {
    return { ok: false, error: "Only super admins can change this." };
  }
  const parsed = capSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Enter a cap between 1 and 5000." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("organizations")
    .update({ research_document_cap: parsed.data.cap })
    .eq("id", (await getCurrentUserProfile())?.organization_id ?? "");
  if (error) return { ok: false, error: GENERIC_ERROR };
  revalidatePath("/workspace/admin/policy");
  revalidatePath(RESEARCH_PATH);
  return { ok: true };
}
