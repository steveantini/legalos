import { describe, expect, it } from "vitest";

import {
  computeTaskBook,
  orgHourlyRate,
  resolveRuns,
} from "./compute";
import type { TaskBookConfig } from "./types";

/**
 * Locks the hybrid blend (productivity calculator Step A): measured run volume ×
 * estimated per-run time delta × the blended fully-loaded rate, with the original
 * rate/savings/cost/ROI methodology preserved.
 */

const AGENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGENT2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("orgHourlyRate", () => {
  it("averages the fully-loaded rate across members with a salary", () => {
    // 104000/2080*1.3 = 65 ; 208000/2080*1.3 = 130 ; average = 97.5
    expect(
      orgHourlyRate([{ salary: 104000 }, { salary: 208000 }]),
    ).toBeCloseTo(97.5, 6);
  });

  it("ignores members with no salary, and is 0 when none have one", () => {
    expect(orgHourlyRate([{ salary: 104000 }, { salary: 0 }])).toBeCloseTo(65, 6);
    expect(orgHourlyRate([{ salary: 0 }])).toBe(0);
    expect(orgHourlyRate([])).toBe(0);
  });
});

describe("resolveRuns", () => {
  it("takes the mapped agent's measured count, zero if it has no usage yet", () => {
    expect(resolveRuns({ agentId: AGENT }, { [AGENT]: 128 })).toEqual({
      runs: 128,
      measured: true,
    });
    expect(resolveRuns({ agentId: AGENT }, {})).toEqual({
      runs: 0,
      measured: true,
    });
  });
});

describe("computeTaskBook", () => {
  const config: TaskBookConfig = {
    costPerUserPerYear: 500,
    members: [{ id: "m1", name: "A", salary: 104000 }], // rate 65, 1 seat
    taskTypes: [
      {
        id: "t1",
        label: "Measured task",
        agentId: AGENT,
        timeWithoutMinutes: 60,
        timeWithMinutes: 20, // saves 40 min/run = 0.6667 h/run
      },
      {
        id: "t2",
        label: "Zero-delta task",
        agentId: AGENT2,
        timeWithoutMinutes: 30,
        timeWithMinutes: 30, // saves 0
      },
    ],
  };

  it("blends measured volume with estimated time and rate, preserving the formulas", () => {
    const r = computeTaskBook(config, { [AGENT]: 100, [AGENT2]: 100 });

    // t1: 40/60 h/run × 100 runs = 66.6667 h ; × 65 = 4333.33
    expect(r.taskTypes[0].runsPerYear).toBe(100);
    expect(r.taskTypes[0].runsMeasured).toBe(true);
    expect(r.taskTypes[0].annualHoursSaved).toBeCloseTo(66.6667, 3);
    expect(r.taskTypes[0].annualSavings).toBeCloseTo(4333.33, 1);

    // t2: measured volume but 0 saved per run → 0 hours
    expect(r.taskTypes[1].runsMeasured).toBe(true);
    expect(r.taskTypes[1].annualHoursSaved).toBe(0);

    expect(r.orgHourlyRate).toBeCloseTo(65, 6);
    expect(r.seatCount).toBe(1);
    expect(r.cost).toBe(500); // 1 seat × 500
    expect(r.totalHoursSaved).toBeCloseTo(66.6667, 3);
    expect(r.totalSavings).toBeCloseTo(4333.33, 1);
    // ROI = (4333.33 - 500) / 500 × 100
    expect(r.roi).toBeCloseTo(766.67, 1);
    expect(r.anyMeasured).toBe(true);
  });

  it("ROI is 0 when there is no cost (guards divide-by-zero)", () => {
    const r = computeTaskBook({ ...config, members: [] }, { [AGENT]: 100 });
    expect(r.cost).toBe(0);
    expect(r.roi).toBe(0);
  });
});
