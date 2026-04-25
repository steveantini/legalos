/**
 * Math + formatting helpers for the productivity calculator. The
 * formulas mirror `agent-launchpad-template/admin.html` (lines
 * 1668–1727 and 1792–1833) verbatim — see Constraint C in CLAUDE.md.
 *
 * - Hourly rate: (Annual Salary / 2080) * 1.3
 * - Hours saved per task row: max(timeWithout - timeWith, 0)
 * - Savings per task row: hoursSaved * hourlyRate
 * - Platform cost: associates.length * costPerUserPerYear
 * - ROI: ((totalSavings - cost) / cost) * 100, or 0 when cost is 0
 *
 * Number formatting matches the original's `toLocaleString` calls.
 */

const HOURS_PER_YEAR = 2080;
const FULLY_LOADED_MULTIPLIER = 1.3;

export function parseSalary(raw: string): number {
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

export function parseHours(raw: string): number {
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

export function parseTasks(raw: string): number {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

export function hourlyRateFromSalary(salary: number): number {
  return (salary / HOURS_PER_YEAR) * FULLY_LOADED_MULTIPLIER;
}

export function hoursSaved(timeWithout: number, timeWith: number): number {
  return Math.max(timeWithout - timeWith, 0);
}

export function rowSavings(hours: number, hourlyRate: number): number {
  return hours * hourlyRate;
}

export function platformCost(
  associateCount: number,
  costPerUserPerYear: number,
): number {
  return associateCount * costPerUserPerYear;
}

export function roiPercent(totalSavings: number, cost: number): number {
  if (cost <= 0) return 0;
  return ((totalSavings - cost) / cost) * 100;
}

export function formatUSD(n: number): string {
  return (
    "$" +
    n.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export function formatUSDInteger(n: number): string {
  return "$" + n.toLocaleString();
}

export function formatHours(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatHoursInteger(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function formatTasksInteger(n: number): string {
  return n.toLocaleString();
}

export function formatRoiPercent(pct: number): string {
  return pct.toFixed(2) + "%";
}
