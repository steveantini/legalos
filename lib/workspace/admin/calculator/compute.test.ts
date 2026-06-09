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
  it("takes a measured count for a mapped agent (zero if no usage yet)", () => {
    expect(resolveRuns({ agentId: AGENT, manualRunsPerYear: null }, { [AGENT]: 128 })).toEqual({
      runs: 128,
      measured: true,
    });
    expect(resolveRuns({ agentId: AGENT, manualRunsPerYear: null }, {})).toEqual({
      runs: 0,
      measured: true,
    });
  });

  it("falls back to the manual estimate when unmapped", () => {
    expect(resolveRuns({ agentId: null, manualRunsPerYear: 50 }, {})).toEqual({
      runs: 50,
      measured: false,
    });
    expect(resolveRuns({ agentId: null, manualRunsPerYear: null }, {})).toEqual({
      runs: 0,
      measured: false,
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
        manualRunsPerYear: null,
      },
      {
        id: "t2",
        label: "Manual task",
        agentId: null,
        timeWithoutMinutes: 30,
        timeWithMinutes: 30, // saves 0
        manualRunsPerYear: 100,
      },
    ],
  };

  it("blends measured volume with estimated time and rate, preserving the formulas", () => {
    const r = computeTaskBook(config, { [AGENT]: 100 });

    // t1: 40/60 h/run × 100 runs = 66.6667 h ; × 65 = 4333.33
    expect(r.taskTypes[0].runsPerYear).toBe(100);
    expect(r.taskTypes[0].runsMeasured).toBe(true);
    expect(r.taskTypes[0].annualHoursSaved).toBeCloseTo(66.6667, 3);
    expect(r.taskTypes[0].annualSavings).toBeCloseTo(4333.33, 1);

    // t2: 0 saved per run regardless of volume
    expect(r.taskTypes[1].runsMeasured).toBe(false);
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
