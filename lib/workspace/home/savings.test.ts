import { describe, expect, it } from "vitest";

import type { TaskBookConfig } from "@/lib/workspace/admin/calculator/types";

import { isSavingsComputable, savingsCells } from "./savings";

/**
 * Locks the home Impact savings blend (calculator Step B): the honest-empty vs.
 * honest-zero vs. live-figure thresholds, the org-average rate, and the delta.
 */

const AGENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

// One member (salary 104000 → fully-loaded rate 65) and one task type mapped to
// AGENT saving 40 min/run (0.6667 h/run).
const FULL: TaskBookConfig = {
  costPerUserPerYear: 500,
  members: [{ id: "m1", name: "A", salary: 104000 }],
  taskTypes: [
    {
      id: "t1",
      label: "x",
      agentId: AGENT,
      timeWithoutMinutes: 60,
      timeWithMinutes: 20,
    },
  ],
};

describe("isSavingsComputable", () => {
  it("is true with at least one task type (volume) AND a salary (rate)", () => {
    expect(isSavingsComputable(FULL)).toBe(true);
  });

  it("is false with no salary (no rate for cost)", () => {
    expect(isSavingsComputable({ ...FULL, members: [] })).toBe(false);
  });

  it("is false with no task types (nothing measurable)", () => {
    expect(isSavingsComputable({ ...FULL, taskTypes: [] })).toBe(false);
  });

  it("is false for an empty book", () => {
    expect(
      isSavingsComputable({ costPerUserPerYear: 500, members: [], taskTypes: [] }),
    ).toBe(false);
  });
});

describe("savingsCells", () => {
  it("returns null cells (setup-needed) when the book is not computable", () => {
    expect(savingsCells({ ...FULL, members: [] }, { [AGENT]: 100 }, null)).toEqual({
      hoursSaved: null,
      costSaved: null,
    });
  });

  it("returns an honest zero (not null) when the user has no runs", () => {
    const r = savingsCells(FULL, {}, null);
    expect(r.hoursSaved).not.toBeNull();
    expect(r.hoursSaved?.current).toBe(0);
    expect(r.costSaved?.current).toBe(0);
  });

  it("blends measured runs with the estimated delta and org-average rate", () => {
    const r = savingsCells(FULL, { [AGENT]: 100 }, { [AGENT]: 50 });
    // 0.6667 h/run × 100 = 66.67 h ; × 65 = 4333.33
    expect(r.hoursSaved?.current).toBeCloseTo(66.6667, 3);
    expect(r.costSaved?.current).toBeCloseTo(4333.33, 1);
    // prior window: 50 runs → 33.33 h ; delta = 33.33
    expect(r.hoursSaved?.previous).toBeCloseTo(33.3333, 3);
    expect(r.hoursSaved?.delta).toBeCloseTo(33.3333, 3);
  });

  it("has no comparison (null previous/delta) when there is no prior window", () => {
    const r = savingsCells(FULL, { [AGENT]: 100 }, null);
    expect(r.hoursSaved?.previous).toBeNull();
    expect(r.hoursSaved?.delta).toBeNull();
  });
});
