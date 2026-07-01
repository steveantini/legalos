import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { executeWorkflowRunWith } from "@/lib/workflows/run";
import type { AutonomyLevel } from "@/lib/workflows/types";

/**
 * The scheduled-run tick (watcher arc, Stage 1, D-220). A cron hits
 * /api/cron/run-schedules; this module selects DUE schedules, atomically CLAIMS
 * each one, and drives the winners through the headless run core
 * (executeWorkflowRunWith) attributing every run to the schedule's human owner
 * (option 2c).
 *
 * Stage 2 (D-221) adds the OVERLAP GUARD: a schedule whose prior run is still in
 * flight (paused for days at an approval gate) is skipped, so it never spawns a
 * second concurrent run. Until a schedule exists (the Stage-2 fixture seed is the
 * first writer), `selectDueSchedules` returns [] and the tick is a genuine no-op.
 *
 * The orchestrator (`runDueSchedules`) is dependency-injected so it is unit-tested
 * over fakes with no DB — the same pattern the pure engine uses (runWorkflow with
 * injected resolvers). The live deps (`buildLiveTickDeps`) wire the service-role
 * admin client (the sanctioned RLS bypass already used by the MCP + usage-event
 * writes); the cron has no user session, so RLS could not admit it anyway.
 */

/** A due schedule, projected to what the tick needs to claim + run it. */
export type DueSchedule = {
  id: string;
  organizationId: string;
  workflowDefinitionId: string;
  ownerUserId: string;
  autonomyLevel: AutonomyLevel;
  runInput: unknown;
  cadenceSeconds: number;
  /** The most recent run this schedule spawned (Stage 1 last_run_id), or null —
   *  the schedule↔run linkage the overlap guard (Stage 2, D-221) reads. */
  lastRunId: string | null;
};

/**
 * The workflow run statuses that are still IN FLIGHT (not terminal). Reuses the
 * workflow run vocabulary (no new states): terminal = completed | failed |
 * cancelled. The overlap guard skips a schedule whose last run is in flight, so a
 * run paused for days at an approval gate never spawns a second concurrent run.
 */
const NON_TERMINAL_RUN_STATUSES = new Set<string>([
  "pending",
  "running",
  "awaiting_approval",
]);

/** True when a run status is non-terminal (still in flight). */
export function isRunInFlight(status: string | null | undefined): boolean {
  return status != null && NON_TERMINAL_RUN_STATUSES.has(status);
}

/**
 * Bearer-secret auth for the cron route (net-new CRON_SECRET convention, D-220).
 * Mirrors the per-call server-only secret idiom (lib/supabase/admin.ts reads
 * SUPABASE_SERVICE_ROLE_KEY from process.env at call time, never at module load,
 * behind a "server-only" import so it can't reach the client bundle).
 *
 * Returns true ONLY when a secret is configured AND the request carries exactly
 * `Authorization: Bearer <secret>` (the header Vercel Cron sends when CRON_SECRET
 * is set). A missing/empty secret is FAIL-CLOSED — it never authorizes — so a
 * misconfigured deploy rejects every tick rather than running the endpoint open.
 */
export function isAuthorizedCronRequest(
  authHeader: string | null,
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  return authHeader === `Bearer ${secret}`;
}

/**
 * The due predicate, as the DB query encodes it (`enabled and next_run_at <=
 * now()`). Exported as the semantic spec the query mirrors, so the "only enabled
 * + due rows run" rule is unit-testable without a database.
 */
export function isScheduleDue(
  s: { enabled: boolean; nextRunAt: string },
  nowMs: number,
): boolean {
  return s.enabled && new Date(s.nextRunAt).getTime() <= nowMs;
}

/** Injected boundary for one tick — DB + run wiring, faked in tests. */
export type ScheduleTickDeps = {
  now: () => number;
  selectDueSchedules: (nowIso: string) => Promise<DueSchedule[]>;
  /** Overlap guard (Stage 2, D-221): true iff the schedule's last run is still in
   *  flight, in which case the tick SKIPS it (no claim, no second concurrent run). */
  hasInFlightRun: (schedule: DueSchedule) => Promise<boolean>;
  /** Atomically claim a schedule for this tick. Returns true iff THIS caller won
   *  (rows-affected === 1). Only the winner proceeds to run. */
  claimSchedule: (schedule: DueSchedule, nowMs: number) => Promise<boolean>;
  runSchedule: (schedule: DueSchedule) => Promise<void>;
};

export type ScheduleTickResult = {
  due: number;
  skipped: number;
  claimed: number;
  ran: number;
};

/**
 * Run every due schedule for one cron tick. For each due schedule it CLAIMS
 * before running: the claim (a conditional advance of next_run_at) makes each
 * tick a single winner, so a duplicate delivery or an overlapping tick can't
 * double-run the same schedule — the house at-most-once idiom (a conditional
 * UPDATE whose rows-affected decides the winner, the same shape as the approval
 * claim in run.ts). Per-schedule failures are isolated so one bad schedule never
 * aborts the tick. At zero schedules (Stage 1 dark), `due` is empty and this is a
 * genuine no-op.
 */
export async function runDueSchedules(
  deps: ScheduleTickDeps,
): Promise<ScheduleTickResult> {
  const nowMs = deps.now();
  const nowIso = new Date(nowMs).toISOString();
  const due = await deps.selectDueSchedules(nowIso);

  let skipped = 0;
  let claimed = 0;
  let ran = 0;
  for (const schedule of due) {
    try {
      // Overlap guard (Stage 2): if the prior run is still in flight (e.g. paused
      // for days at an approval gate), skip this tick — do NOT claim or run, so
      // the schedule never spawns a second concurrent run.
      if (await deps.hasInFlightRun(schedule)) {
        skipped += 1;
        continue;
      }
      const won = await deps.claimSchedule(schedule, nowMs);
      if (!won) continue;
      claimed += 1;
      await deps.runSchedule(schedule);
      ran += 1;
    } catch {
      // Isolate a per-schedule failure so the rest of the tick still runs. No PII
      // in the log — the schedule id only.
      console.error("schedule tick: a schedule failed", { scheduleId: schedule.id });
    }
  }
  return { due: due.length, skipped, claimed, ran };
}

/**
 * Live tick deps over the service-role admin client. The select filters on
 * `enabled = true and next_run_at <= now()`; the claim conditionally advances
 * next_run_at (only the row still due at claim time is updated, so exactly one
 * concurrent tick wins); the run drives the headless core with the owner as the
 * run identity (2c) and best-effort records the spawned run id.
 */
export function buildLiveTickDeps(): ScheduleTickDeps {
  const admin = createSupabaseAdminClient();

  return {
    now: () => Date.now(),

    selectDueSchedules: async (nowIso) => {
      const { data, error } = await admin
        .from("workflow_schedules")
        .select(
          "id, organization_id, workflow_definition_id, owner_user_id, autonomy_level, run_input, cadence_seconds, last_run_id",
        )
        .eq("enabled", true)
        .lte("next_run_at", nowIso);
      if (error) {
        console.error("workflow_schedules due select failed", { code: error.code });
        return [];
      }
      return (data ?? []).map((r) => ({
        id: r.id as string,
        organizationId: r.organization_id as string,
        workflowDefinitionId: r.workflow_definition_id as string,
        ownerUserId: r.owner_user_id as string,
        autonomyLevel: ((r.autonomy_level as AutonomyLevel) ?? "supervised"),
        runInput: (r.run_input as unknown) ?? null,
        cadenceSeconds: r.cadence_seconds as number,
        lastRunId: (r.last_run_id as string | null) ?? null,
      }));
    },

    hasInFlightRun: async (schedule) => {
      // No prior run ⇒ nothing in flight. Otherwise read that run's status and
      // treat a non-terminal status as in flight (the overlap guard).
      if (!schedule.lastRunId) return false;
      const { data, error } = await admin
        .from("workflow_runs")
        .select("status")
        .eq("id", schedule.lastRunId)
        .maybeSingle();
      if (error) {
        console.error("workflow_runs status read failed", { code: error.code });
        // Fail SAFE: if we cannot confirm the prior run settled, skip this tick
        // rather than risk a concurrent second run.
        return true;
      }
      return isRunInFlight((data as { status: string } | null)?.status);
    },

    claimSchedule: async (schedule, nowMs) => {
      const tickIso = new Date(nowMs).toISOString();
      const nextRunAt = new Date(
        nowMs + schedule.cadenceSeconds * 1000,
      ).toISOString();
      // Conditional advance: only a row that is STILL enabled and due at claim
      // time is updated. A concurrent/duplicate tick that already advanced
      // next_run_at matches zero rows and loses. rows-affected === 1 ⇒ winner.
      const { data } = await admin
        .from("workflow_schedules")
        .update({ next_run_at: nextRunAt, last_run_at: tickIso })
        .eq("id", schedule.id)
        .eq("enabled", true)
        .lte("next_run_at", tickIso)
        .select("id");
      return Array.isArray(data) && data.length === 1;
    },

    runSchedule: async (schedule) => {
      // Inject the schedule id into the run input so a native watcher effect can
      // stamp its findings with the schedule that produced them (Stage 2). The
      // cron is the authoritative source of the triggering schedule id.
      const base =
        schedule.runInput && typeof schedule.runInput === "object"
          ? (schedule.runInput as Record<string, unknown>)
          : {};
      const runInput = { ...base, scheduleId: schedule.id };
      const result = await executeWorkflowRunWith({
        supabase: admin,
        organizationId: schedule.organizationId,
        // Option 2c: attribute the run to the schedule's human owner so the
        // existing owner-scoped RLS admits their pause/approve/resume/read.
        userId: schedule.ownerUserId,
        definitionId: schedule.workflowDefinitionId,
        runInput,
        autonomyLevel: schedule.autonomyLevel,
      });
      if (result.ok) {
        // Best-effort: point the schedule at the run it just spawned.
        await admin
          .from("workflow_schedules")
          .update({ last_run_id: result.runId })
          .eq("id", schedule.id);
      }
    },
  };
}
