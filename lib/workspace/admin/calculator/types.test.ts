import { describe, expect, it } from "vitest";

import { parseTaskBookConfig } from "./types";

/**
 * The READ path is tolerant where WRITE is strict (D-177): a legacy/other-env
 * config may still carry a manual task (`agentId: null`) and a leftover
 * `manualRunsPerYear` key. Parsing must drop only the manual task, never reject
 * the whole book, so one droppable task can't fail-closed an org's config.
 */

const AGENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("parseTaskBookConfig", () => {
  it("drops a legacy manual task but keeps the rest of the book intact", () => {
    const stored = {
      costPerUserPerYear: 500,
      members: [{ id: "m1", name: "A", salary: 104000 }],
      taskTypes: [
        // Legacy manual task with a leftover manualRunsPerYear key.
        {
          id: "manual",
          label: "Manual one",
          agentId: null,
          manualRunsPerYear: 80,
          timeWithoutMinutes: 60,
          timeWithMinutes: 20,
        },
        {
          id: "mapped",
          label: "Mapped one",
          agentId: AGENT,
          timeWithoutMinutes: 60,
          timeWithMinutes: 20,
        },
      ],
    };

    const parsed = parseTaskBookConfig(stored);
    expect(parsed).not.toBeNull();
    expect(parsed?.members).toHaveLength(1);
    expect(parsed?.costPerUserPerYear).toBe(500);
    // Only the mapped task survives; the manual one is dropped.
    expect(parsed?.taskTypes.map((t) => t.id)).toEqual(["mapped"]);
    // The leftover manualRunsPerYear key is stripped from the returned shape.
    expect(parsed?.taskTypes[0]).not.toHaveProperty("manualRunsPerYear");
    expect(parsed?.taskTypes[0].agentId).toBe(AGENT);
  });

  it("returns an all-mapped book unchanged", () => {
    const parsed = parseTaskBookConfig({
      costPerUserPerYear: 500,
      members: [],
      taskTypes: [
        { id: "t1", label: "x", agentId: AGENT, timeWithoutMinutes: 60, timeWithMinutes: 20 },
      ],
    });
    expect(parsed?.taskTypes).toHaveLength(1);
  });

  it("returns an all-manual book as a book with no task types (not null)", () => {
    const parsed = parseTaskBookConfig({
      costPerUserPerYear: 500,
      members: [{ id: "m1", name: "A", salary: 104000 }],
      taskTypes: [
        { id: "m", label: "m", agentId: null, timeWithoutMinutes: 60, timeWithMinutes: 20 },
      ],
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.taskTypes).toEqual([]);
    expect(parsed?.members).toHaveLength(1);
  });

  it("returns null only on a genuine parse failure", () => {
    expect(parseTaskBookConfig({ costPerUserPerYear: "nope" })).toBeNull();
    expect(parseTaskBookConfig(null)).toBeNull();
    expect(
      parseTaskBookConfig({
        costPerUserPerYear: 500,
        members: [],
        taskTypes: [{ id: "bad", label: "x", agentId: "not-a-uuid", timeWithoutMinutes: 1, timeWithMinutes: 1 }],
      }),
    ).toBeNull();
  });
});
