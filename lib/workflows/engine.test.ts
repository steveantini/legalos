import { describe, expect, it, vi } from "vitest";

import { runWorkflow, type WorkflowEngineDeps } from "./engine";
import type { WorkflowDefinition } from "./types";

/** Deps with sensible fakes; override per test. nowIso is fixed (timing isn't asserted). */
function deps(over: Partial<WorkflowEngineDeps>): WorkflowEngineDeps {
  return {
    runAgentStep: async (_step, input) => ({ ok: true, output: `out:${input}` }),
    runToolActionStep: async () => ({ ok: true, output: "tool-out" }),
    nowIso: () => "2026-06-05T00:00:00.000Z",
    ...over,
  };
}

describe("runWorkflow", () => {
  it("walks a linear two-step run, defaulting to the previous output, with two immutable step records", async () => {
    const def: WorkflowDefinition = {
      steps: [
        { id: "a1", type: "agent", name: "First", agentId: "ag1" },
        { id: "a2", type: "agent", name: "Second", agentId: "ag2" }, // no inputMapping → previous
      ],
    };
    const outcome = await runWorkflow(def, "start", deps({}));

    expect(outcome.status).toBe("completed");
    expect(outcome.steps).toHaveLength(2);
    // Step 1 consumes the run input (first step's `previous` = run input).
    expect(outcome.steps[0]).toMatchObject({ stepId: "a1", sequence: 0, status: "completed", input: "start", output: "out:start" });
    // Step 2 defaults to the previous step's output.
    expect(outcome.steps[1]).toMatchObject({ stepId: "a2", sequence: 1, status: "completed", input: "out:start", output: "out:out:start" });
  });

  it("resolves run_input and a named prior step distinctly from previous", async () => {
    const def: WorkflowDefinition = {
      steps: [
        { id: "a1", type: "agent", name: "First", agentId: "ag1" },
        {
          id: "t1",
          type: "tool_action",
          name: "Tool",
          serverId: "gdrive",
          toolName: "search_files",
          argMapping: { q: { source: "run_input" } },
        },
        {
          id: "a2",
          type: "agent",
          name: "Third",
          agentId: "ag2",
          inputMapping: { source: "step", stepId: "a1" }, // the NAMED prior step, not previous (t1)
        },
      ],
    };
    const runToolActionStep = vi.fn(async () => ({ ok: true, output: "T1" }));
    const outcome = await runWorkflow(def, "start", deps({ runToolActionStep }));

    expect(outcome.status).toBe("completed");
    // tool args resolved from run_input
    expect(runToolActionStep).toHaveBeenCalledWith(expect.objectContaining({ id: "t1" }), { q: "start" });
    // a2 consumed a1's output ("out:start"), NOT the previous step t1's output ("T1")
    expect(outcome.steps[2]).toMatchObject({ stepId: "a2", input: "out:start", output: "out:out:start" });
  });

  it("fail-stops on a step failure: run failed, no further steps", async () => {
    const def: WorkflowDefinition = {
      steps: [
        { id: "a1", type: "agent", name: "First", agentId: "ag1" },
        { id: "a2", type: "agent", name: "Second", agentId: "ag2" },
      ],
    };
    const runAgentStep = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, output: null, error: "boom" });
    const outcome = await runWorkflow(def, "start", deps({ runAgentStep }));

    expect(outcome.status).toBe("failed");
    expect(outcome.error).toBe("boom");
    expect(outcome.steps).toHaveLength(1);
    expect(outcome.steps[0]).toMatchObject({ status: "failed", error: "boom" });
    expect(runAgentStep).toHaveBeenCalledTimes(1); // the second step never ran
  });

  it("pauses at a human_checkpoint ('awaiting_approval') and stops without approving", async () => {
    const def: WorkflowDefinition = {
      steps: [
        { id: "a1", type: "agent", name: "First", agentId: "ag1" },
        { id: "c1", type: "human_checkpoint", name: "Approve", prompt: "OK?" },
        { id: "a2", type: "agent", name: "After", agentId: "ag2" },
      ],
    };
    const runAgentStep = vi.fn(async (_s, input) => ({ ok: true, output: `out:${input}` }));
    const outcome = await runWorkflow(def, "start", deps({ runAgentStep }));

    expect(outcome.status).toBe("awaiting_approval");
    expect(outcome.steps).toHaveLength(2);
    expect(outcome.steps[1]).toMatchObject({ stepId: "c1", status: "awaiting_approval", output: null });
    expect(runAgentStep).toHaveBeenCalledTimes(1); // the step after the checkpoint never ran
  });

  it("never throws — a throwing resolver becomes a typed failed step", async () => {
    const def: WorkflowDefinition = {
      steps: [{ id: "a1", type: "agent", name: "First", agentId: "ag1" }],
    };
    const runAgentStep = vi.fn(async () => {
      throw new Error("kaboom");
    });
    const outcome = await runWorkflow(def, "start", deps({ runAgentStep }));

    expect(outcome.status).toBe("failed");
    expect(outcome.steps[0].status).toBe("failed");
    expect(outcome.steps[0].error).toContain("threw");
  });
});
