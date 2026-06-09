import {
  computeTaskBook,
  orgHourlyRate,
  type MeasuredRuns,
} from "@/lib/workspace/admin/calculator/compute";
import type { TaskBookConfig } from "@/lib/workspace/admin/calculator/types";

/**
 * The per-user savings blend for the home Impact card (calculator Step B).
 *
 * Reuses the Step-A compute (`computeTaskBook`) so there is no duplicated rate or
 * time-delta math: it applies the org book's estimated per-run deltas and the
 * blended org-average rate to a user's MEASURED per-agent run counts for a
 * window. `null` cells are the honest setup-needed state.
 */

export type SavingsCell = {
  current: number;
  previous: number | null;
  delta: number | null;
};

/**
 * The book can compute savings only when it has at least one agent-mapped task
 * type (a measurable VOLUME) and a positive blended rate (at least one member
 * salary, for the COST). Otherwise the cells stay in the honest setup-needed
 * state. A computable book with zero user runs still yields an honest zero.
 */
export function isSavingsComputable(config: TaskBookConfig): boolean {
  return (
    orgHourlyRate(config.members) > 0 &&
    config.taskTypes.some((t) => t.agentId !== null)
  );
}

export function savingsCells(
  config: TaskBookConfig,
  runsCurrent: MeasuredRuns,
  runsPrev: MeasuredRuns | null,
): { hoursSaved: SavingsCell | null; costSaved: SavingsCell | null } {
  if (!isSavingsComputable(config)) {
    return { hoursSaved: null, costSaved: null };
  }

  const cur = computeTaskBook(config, runsCurrent);
  const prev = runsPrev ? computeTaskBook(config, runsPrev) : null;

  return {
    hoursSaved: {
      current: cur.totalHoursSaved,
      previous: prev ? prev.totalHoursSaved : null,
      delta: prev ? cur.totalHoursSaved - prev.totalHoursSaved : null,
    },
    costSaved: {
      current: cur.totalSavings,
      previous: prev ? prev.totalSavings : null,
      delta: prev ? cur.totalSavings - prev.totalSavings : null,
    },
  };
}
