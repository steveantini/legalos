import {
  hourlyRateFromSalary,
  hoursSaved,
  platformCost,
  roiPercent,
  rowSavings,
} from "@/components/admin/calculator/math";

import type { TaskBookConfig, TaskTypeConfig } from "./types";

/**
 * The hybrid calculation (productivity calculator Step A).
 *
 * The core methodology functions are UNCHANGED from the original calculator
 * (`hourlyRateFromSalary` = salary/2080×1.3, `rowSavings` = hours×rate,
 * `platformCost` = seats×costPerUser, `roiPercent`). What changed is the data
 * source: the run VOLUME is measured from real usage, while the per-run time
 * delta and salary stay estimates. Concretely, a task type's annual hours saved =
 * (estimated minutes saved per run ÷ 60) × measured runs per year. The original's
 * per-row `hoursSaved(without, with)` is reused for the per-run minute delta.
 *
 * Pure and isomorphic — the editor computes live as the admin types, and the
 * tests assert the blend, so it carries no server/client concern.
 */

export type MeasuredRuns = Record<string, number>;

export interface TaskTypeResult {
  id: string;
  label: string;
  runsPerYear: number;
  /** Always true: every task's volume is the mapped agent's measured usage. */
  runsMeasured: boolean;
  hoursSavedPerRun: number;
  annualHoursSaved: number;
  annualSavings: number;
}

export interface TaskBookResult {
  orgHourlyRate: number;
  seatCount: number;
  totalHoursSaved: number;
  totalSavings: number;
  cost: number;
  roi: number;
  taskTypes: TaskTypeResult[];
  /** Whether any task type's volume is measured (drives the honest output note). */
  anyMeasured: boolean;
}

/** The blended fully-loaded hourly rate: the average over members with a salary. */
export function orgHourlyRate(members: MemberLike[]): number {
  const rates = members
    .map((m) => hourlyRateFromSalary(m.salary))
    .filter((r) => r > 0);
  if (rates.length === 0) return 0;
  return rates.reduce((a, b) => a + b, 0) / rates.length;
}

type MemberLike = { salary: number };

export function resolveRuns(
  taskType: Pick<TaskTypeConfig, "agentId">,
  measured: MeasuredRuns,
): { runs: number; measured: boolean } {
  // Volume is always the mapped agent's measured count (0 until it has run).
  return { runs: measured[taskType.agentId] ?? 0, measured: true };
}

export function computeTaskBook(
  config: TaskBookConfig,
  measured: MeasuredRuns,
): TaskBookResult {
  const rate = orgHourlyRate(config.members);

  const taskTypes: TaskTypeResult[] = config.taskTypes.map((t) => {
    const resolved = resolveRuns(t, measured);
    const hoursSavedPerRun = hoursSaved(t.timeWithoutMinutes, t.timeWithMinutes) / 60;
    const annualHoursSaved = hoursSavedPerRun * resolved.runs;
    const annualSavings = rowSavings(annualHoursSaved, rate);
    return {
      id: t.id,
      label: t.label,
      runsPerYear: resolved.runs,
      runsMeasured: resolved.measured,
      hoursSavedPerRun,
      annualHoursSaved,
      annualSavings,
    };
  });

  const totalHoursSaved = taskTypes.reduce((a, t) => a + t.annualHoursSaved, 0);
  const totalSavings = taskTypes.reduce((a, t) => a + t.annualSavings, 0);
  const seatCount = config.members.length;
  const cost = platformCost(seatCount, config.costPerUserPerYear);
  const roi = roiPercent(totalSavings, cost);

  return {
    orgHourlyRate: rate,
    seatCount,
    totalHoursSaved,
    totalSavings,
    cost,
    roi,
    taskTypes,
    anyMeasured: taskTypes.some((t) => t.runsMeasured),
  };
}
