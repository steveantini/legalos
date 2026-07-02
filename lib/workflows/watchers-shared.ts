import { z } from "zod";

import { RENEWAL_WATCHER_TEMPLATE } from "@/lib/workflows/templates";

/**
 * Pure watcher helpers (watcher arc Stage 3a, D-224) — shared by the adopt
 * flow, the "Your watchers" list, and their tests. No I/O, no React.
 *
 * A WATCHER is a workflow definition adopted from a watcher template plus the
 * workflow_schedules row that runs it on a cadence. The adopt flow (not the
 * fork button) is the deliberate path: a watcher without a schedule never
 * fires, so the two are created together.
 */

/** Template slugs that adopt as scheduled watchers (v1: the renewal watcher). */
export const WATCHER_TEMPLATE_SLUGS = new Set<string>([
  RENEWAL_WATCHER_TEMPLATE.slug,
]);

export function isWatcherTemplateSlug(slug: string | null | undefined): boolean {
  return slug != null && WATCHER_TEMPLATE_SLUGS.has(slug);
}

/**
 * The cadence PRESETS the adopt flow offers (stored as cadence_seconds; no
 * raw-seconds input — the column stays general, the UI stays a choice). Daily
 * is the default: renewals move on a scale of days, and idempotent findings
 * make a daily re-scan free.
 */
export const WATCHER_CADENCES = [
  { value: "daily", label: "Daily", seconds: 86_400 },
  { value: "weekly", label: "Weekly", seconds: 604_800 },
] as const;

export type WatcherCadence = (typeof WATCHER_CADENCES)[number]["value"];

export function cadenceSecondsFor(cadence: WatcherCadence): number {
  const preset = WATCHER_CADENCES.find((c) => c.value === cadence);
  // The find can't miss (cadence is the presets' own union); the fallback keeps
  // the function total without a non-null assertion.
  return preset?.seconds ?? 86_400;
}

/**
 * A human label for a stored cadence. Exact preset matches read as their
 * preset ("Daily", "Weekly"); anything else (e.g. the 900s fixture schedule)
 * reads honestly as its interval rather than rounding to a preset it isn't.
 */
export function cadenceLabelForSeconds(seconds: number): string {
  const preset = WATCHER_CADENCES.find((c) => c.seconds === seconds);
  if (preset) return preset.label;
  if (seconds % 86_400 === 0) {
    const days = seconds / 86_400;
    return days === 1 ? "Daily" : `Every ${days} days`;
  }
  if (seconds % 3_600 === 0) {
    const hours = seconds / 3_600;
    return hours === 1 ? "Hourly" : `Every ${hours} hours`;
  }
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes === 1 ? "Every minute" : `Every ${minutes} minutes`;
}

export const DEFAULT_WATCHER_WINDOW_DAYS = 60;

/**
 * The adopt input, validated at the trust boundary. windowDays is bounded to a
 * year — a watcher that "warns" 10 years out is noise, and the scan window is
 * a lookahead, not an archive.
 */
export const adoptWatcherInputSchema = z.object({
  templateId: z.string().uuid(),
  collectionId: z.string().uuid(),
  windowDays: z
    .number()
    .int()
    .min(1)
    .max(365)
    .default(DEFAULT_WATCHER_WINDOW_DAYS),
  cadence: z.enum(["daily", "weekly"]).default("daily"),
  autonomyLevel: z.enum(["supervised", "autonomous"]).default("supervised"),
});

export type AdoptWatcherInput = z.infer<typeof adoptWatcherInputSchema>;

/**
 * Build the workflow_schedules row an adoption inserts. Pure so the row's
 * invariants are unit-tested: the OWNER IS THE ADOPTER (option 2c — their
 * owner-scoped RLS admits the runs' pause/approve/resume with no policy
 * change), the schedule starts ENABLED and immediately due (the next cron tick
 * picks it up), and the run_input carries exactly what the scan reads
 * (findingKind, windowDays, collectionId — no isFixture: real adoptions are
 * real data).
 */
export function buildWatcherScheduleRow(params: {
  organizationId: string;
  workflowDefinitionId: string;
  adopterUserId: string;
  input: AdoptWatcherInput;
  nowIso: string;
}): {
  organization_id: string;
  workflow_definition_id: string;
  owner_user_id: string;
  enabled: true;
  next_run_at: string;
  cadence_seconds: number;
  autonomy_level: "supervised" | "autonomous";
  run_input: { findingKind: string; windowDays: number; collectionId: string };
} {
  return {
    organization_id: params.organizationId,
    workflow_definition_id: params.workflowDefinitionId,
    owner_user_id: params.adopterUserId,
    enabled: true,
    next_run_at: params.nowIso,
    cadence_seconds: cadenceSecondsFor(params.input.cadence),
    autonomy_level: params.input.autonomyLevel,
    run_input: {
      findingKind: "renewal",
      windowDays: params.input.windowDays,
      collectionId: params.input.collectionId,
    },
  };
}

/**
 * Read the window (days) back out of a stored schedule's run_input for the
 * watchers list. Defensive over the untrusted jsonb, mirroring
 * parseRenewalScanConfig's posture; null when absent so the row omits the
 * detail rather than inventing one.
 */
export function windowDaysFromRunInput(runInput: unknown): number | null {
  if (!runInput || typeof runInput !== "object") return null;
  const v = (runInput as Record<string, unknown>).windowDays;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}
