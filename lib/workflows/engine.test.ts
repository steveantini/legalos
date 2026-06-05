import { describe, expect, it, vi } from "vitest";

import {
  resumeWorkflow,
  runWorkflow,
  type ResolveContext,
  type WorkflowEngineDeps,
} from "./engine";
import type { PendingWriteAction, WorkflowDefinition } from "./types";

/** Deps with read-only fakes; override per test. nowIso fixed (timing not asserted). */
function deps(over: Partial<WorkflowEngineDeps>): WorkflowEngineDeps {
  return {
    runAgentStep: async (_step, input) => ({ ok: true, output: `out:${input}` }),
    runToolActionStep: async () => ({ kind: "executed", ok: true, output: "tool-out" }),
    nowIso: () => "2026-06-05T00:00:00.000Z",
    ...over,
  };
}

const FAKE_ROUTE = {
  serverId: "gdrive",
  connectionId: "conn-1",
  tokenRef: "tok-1",
  serverUrl: "https://example.test/mcp",
  originalToolName: "create_file",
};
const FAKE_PENDING: PendingWriteAction = {
  route: FAKE_ROUTE,
  toolInput: { name: "x" },
  toolUseId: "tu_w",
};

describe("runWorkflow (fresh walk)", () => {
  it("walks a linear two-step run, defaulting to the previous output", async () => {
    const def: WorkflowDefinition = {
      steps: [
        { id: "a1", type: "agent", name: "First", agentId: "ag1" },
        { id: "a2", type: "agent", name: "Second", agentId: "ag2" },
      ],
    };
    const r = await runWorkflow(def, "start", deps({}));
    expect(r.status).toBe("completed");
    expect(r.steps).toHaveLength(2);
    expect(r.steps[0]).toMatchObject({ stepId: "a1", input: "start", output: "out:start", approvalMode: null });
    expect(r.steps[1]).toMatchObject({ stepId: "a2", input: "out:start", output: "out:out:start" });
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
        { id: "a2", type: "agent", name: "Third", agentId: "ag2", inputMapping: { source: "step", stepId: "a1" } },
      ],
    };
    const runToolActionStep = vi.fn(async () => ({ kind: "executed" as const, ok: true, output: "T1" }));
    const r = await runWorkflow(def, "start", deps({ runToolActionStep }));
    expect(r.status).toBe("completed");
    expect(runToolActionStep).toHaveBeenCalledWith(expect.objectContaining({ id: "t1" }), { q: "start" });
    expect(r.steps[2]).toMatchObject({ stepId: "a2", input: "out:start", output: "out:out:start" });
  });

  it("fail-stops on a step failure", async () => {
    const def: WorkflowDefinition = {
      steps: [
        { id: "a1", type: "agent", name: "First", agentId: "ag1" },
        { id: "a2", type: "agent", name: "Second", agentId: "ag2" },
      ],
    };
    const runAgentStep = vi.fn().mockResolvedValueOnce({ ok: false, output: null, error: "boom" });
    const r = await runWorkflow(def, "start", deps({ runAgentStep }));
    expect(r.status).toBe("failed");
    expect(r.steps).toHaveLength(1);
    expect(runAgentStep).toHaveBeenCalledTimes(1);
  });

  it("never throws — a throwing resolver becomes a failed step", async () => {
    const def: WorkflowDefinition = { steps: [{ id: "a1", type: "agent", name: "First", agentId: "ag1" }] };
    const r = await runWorkflow(def, "start", deps({ runAgentStep: async () => { throw new Error("kaboom"); } }));
    expect(r.status).toBe("failed");
    expect(r.steps[0].status).toBe("failed");
  });

  it("read steps (agent + read tool_action) never pause, in any mode", async () => {
    const def: WorkflowDefinition = {
      steps: [
        { id: "a1", type: "agent", name: "A", agentId: "ag1" },
        { id: "t1", type: "tool_action", name: "Read", serverId: "gdrive", toolName: "search_files" },
      ],
    };
    for (const autonomy of ["supervised", "autonomous"] as const) {
      const r = await runWorkflow(def, "start", deps({}), autonomy);
      expect(r.status).toBe("completed");
      expect(r.pending).toBeNull();
    }
  });
});

describe("runWorkflow — checkpoints + writes pause by autonomy", () => {
  const checkpointDef: WorkflowDefinition = {
    steps: [
      { id: "c1", type: "human_checkpoint", name: "Approve", prompt: "OK?" },
      { id: "a2", type: "agent", name: "After", agentId: "ag2" },
    ],
  };
  const writeDef: WorkflowDefinition = {
    steps: [
      { id: "w1", type: "tool_action", name: "Write", serverId: "gdrive", toolName: "create_file" },
      { id: "a2", type: "agent", name: "After", agentId: "ag2" },
    ],
  };
  const writeDeps = () => deps({ runToolActionStep: async () => ({ kind: "needs_approval" as const, pendingAction: FAKE_PENDING }) });

  it("supervised: pauses at a human_checkpoint and stops", async () => {
    const r = await runWorkflow(checkpointDef, "start", deps({}), "supervised");
    expect(r.status).toBe("awaiting_approval");
    expect(r.pending).toMatchObject({ kind: "checkpoint", stepId: "c1" });
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0]).toMatchObject({ status: "awaiting_approval" });
  });

  it("autonomous: auto-proceeds a human_checkpoint (auto_proceeded) and continues", async () => {
    const r = await runWorkflow(checkpointDef, "start", deps({}), "autonomous");
    expect(r.status).toBe("completed");
    expect(r.steps[0]).toMatchObject({ stepId: "c1", status: "completed", approvalMode: "auto_proceeded" });
    expect(r.steps[1]).toMatchObject({ stepId: "a2", input: "start" }); // checkpoint passed the value through
  });

  it("supervised: pauses at a WRITE tool_action (needs approval, not executed)", async () => {
    const r = await runWorkflow(writeDef, "start", writeDeps(), "supervised");
    expect(r.status).toBe("awaiting_approval");
    expect(r.pending).toMatchObject({ kind: "write", stepId: "w1" });
  });

  it("autonomous: STILL pauses at a write (no unattended writes in any mode)", async () => {
    const r = await runWorkflow(writeDef, "start", writeDeps(), "autonomous");
    expect(r.status).toBe("awaiting_approval");
    expect(r.pending).toMatchObject({ kind: "write" });
  });
});

describe("resumeWorkflow (decision-driven resume)", () => {
  const writeDef: WorkflowDefinition = {
    steps: [
      { id: "w1", type: "tool_action", name: "Write", serverId: "gdrive", toolName: "create_file" },
      { id: "a2", type: "agent", name: "After", agentId: "ag2" },
    ],
  };
  const checkpointDef: WorkflowDefinition = {
    steps: [
      { id: "c1", type: "human_checkpoint", name: "Approve", prompt: "OK?" },
      { id: "a2", type: "agent", name: "After", agentId: "ag2" },
    ],
  };
  const freshCtx = (): ResolveContext => ({ runInput: "start", previousOutput: "start", outputs: new Map() });

  it("approve a checkpoint → records human_approved and completes the run", async () => {
    const r = await resumeWorkflow({
      definition: checkpointDef,
      autonomy: "supervised",
      deps: deps({}),
      pausedIndex: 0,
      pausedKind: "checkpoint",
      pendingAction: null,
      decision: "approve",
      ctx: freshCtx(),
      claimPaused: async () => true,
      executeApprovedWrite: async () => ({ ok: true, output: null }),
    });
    expect(r.claimed).toBe(true);
    expect(r.pausedStepRecord).toMatchObject({ stepId: "c1", status: "completed", approvalMode: "human_approved" });
    expect(r.runStatus).toBe("completed");
    expect(r.segment?.steps[0]).toMatchObject({ stepId: "a2", input: "start" });
  });

  it("approve a write → executes it via executeApprovedWrite, records human_approved, continues", async () => {
    const executeApprovedWrite = vi.fn(async () => ({ ok: true, output: "WROTE" }));
    const r = await resumeWorkflow({
      definition: writeDef,
      autonomy: "supervised",
      deps: deps({}),
      pausedIndex: 0,
      pausedKind: "write",
      pendingAction: FAKE_PENDING,
      decision: "approve",
      ctx: freshCtx(),
      claimPaused: async () => true,
      executeApprovedWrite,
    });
    expect(executeApprovedWrite).toHaveBeenCalledTimes(1);
    expect(r.pausedStepRecord).toMatchObject({ stepId: "w1", status: "completed", approvalMode: "human_approved", output: "WROTE" });
    expect(r.runStatus).toBe("completed");
    expect(r.segment?.steps[0]).toMatchObject({ stepId: "a2", input: "WROTE" }); // downstream consumed the write output
  });

  it("deny → run cancelled, write never executes, no continuation", async () => {
    const executeApprovedWrite = vi.fn(async () => ({ ok: true, output: "WROTE" }));
    const r = await resumeWorkflow({
      definition: writeDef,
      autonomy: "supervised",
      deps: deps({}),
      pausedIndex: 0,
      pausedKind: "write",
      pendingAction: FAKE_PENDING,
      decision: "deny",
      ctx: freshCtx(),
      claimPaused: async () => true,
      executeApprovedWrite,
    });
    expect(executeApprovedWrite).not.toHaveBeenCalled();
    expect(r.runStatus).toBe("cancelled");
    expect(r.pausedStepRecord).toMatchObject({ stepId: "w1", status: "failed" });
    expect(r.segment).toBeNull();
  });

  it("at-most-once: a double-approve executes the write exactly once (atomic claim)", async () => {
    let claims = 0;
    const claimPaused = async () => {
      claims += 1;
      return claims === 1; // only the first caller wins
    };
    const executeApprovedWrite = vi.fn(async () => ({ ok: true, output: "WROTE" }));
    const common = {
      definition: writeDef,
      autonomy: "supervised" as const,
      deps: deps({}),
      pausedIndex: 0,
      pausedKind: "write" as const,
      pendingAction: FAKE_PENDING,
      decision: "approve" as const,
      claimPaused,
      executeApprovedWrite,
    };
    const r1 = await resumeWorkflow({ ...common, ctx: freshCtx() });
    const r2 = await resumeWorkflow({ ...common, ctx: freshCtx() });
    expect(r1.claimed).toBe(true);
    expect(r2.claimed).toBe(false);
    expect(executeApprovedWrite).toHaveBeenCalledTimes(1);
  });
});
