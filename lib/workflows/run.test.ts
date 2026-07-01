import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the workflow run ORCHESTRATOR (lib/workflows/run.ts).
 *
 * The pure engine (runWorkflow / resumeWorkflow) is already covered by
 * engine.test.ts; these tests do NOT re-test the engine. They cover what run.ts
 * adds AROUND it: the auth / not-found / not-runnable / invalid-definition gates,
 * the at-most-once already-decided behavior at the run layer, the persistence
 * orchestration (run row, step rows, pending approval, run settle), and the
 * never-throws contract. The engine, the Supabase boundary, and the leaf
 * resolvers are mocked so the orchestration logic runs over controlled inputs.
 */

const mocks = vi.hoisted(() => ({
  getCurrentUserProfile: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  runWorkflow: vi.fn(),
  resumeWorkflow: vi.fn(),
  validateWorkflowDefinition: vi.fn(),
  resolveOrgMcpTools: vi.fn(),
}));

vi.mock("@/lib/auth/access", () => ({
  getCurrentUserProfile: mocks.getCurrentUserProfile,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/lib/workflows/engine", () => ({
  runWorkflow: mocks.runWorkflow,
  resumeWorkflow: mocks.resumeWorkflow,
}));
vi.mock("@/lib/workflows/validate", () => ({
  validateWorkflowDefinition: mocks.validateWorkflowDefinition,
  asWorkflowDefinition: (d: unknown) => d,
}));
vi.mock("@/lib/connections/mcp/agent-tools", () => ({
  resolveOrgMcpTools: mocks.resolveOrgMcpTools,
}));
// Leaf modules used only inside buildEngineDeps' resolver closures, which the
// mocked engine never invokes — stubbed so importing run.ts stays light.
vi.mock("@/lib/agents/run-agent", () => ({ runAgent: vi.fn(), resumeAgent: vi.fn() }));
vi.mock("@/lib/connections/mcp/execute-tool", () => ({ executeMcpTool: vi.fn() }));
vi.mock("@/lib/connections/mcp/tool-classification", () => ({ classifyMcpTool: vi.fn() }));
vi.mock("@/lib/workflows/agent-task", () => ({ composeAgentTask: (_i: string, x: string) => x }));

import {
  executeWorkflowRun,
  executeWorkflowRunWith,
  resumeWorkflowApproval,
} from "./run";

interface Query {
  table: string;
  op: "select" | "insert" | "update";
  terminal: "maybeSingle" | "single" | "list" | null;
  count: boolean;
}

/** In-memory Supabase fake: `respond(query)` returns the result for each query;
 * `calls` records every query so tests can assert what was persisted. */
function makeDb(
  respond: (q: Query) => { data?: unknown; error?: unknown; count?: number },
  calls: Query[] = [],
) {
  return {
    from(table: string) {
      const q: Query = { table, op: "select", terminal: null, count: false };
      const b = {
        select(_cols?: string, opts?: { head?: boolean; count?: string }) {
          if (opts && (opts.head || opts.count)) q.count = true;
          return b;
        },
        insert() {
          q.op = "insert";
          return b;
        },
        update() {
          q.op = "update";
          return b;
        },
        eq() {
          return b;
        },
        neq() {
          return b;
        },
        order() {
          return b;
        },
        maybeSingle() {
          q.terminal = "maybeSingle";
          calls.push({ ...q });
          return Promise.resolve(respond(q));
        },
        single() {
          q.terminal = "single";
          calls.push({ ...q });
          return Promise.resolve(respond(q));
        },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          if (!q.terminal) q.terminal = "list";
          calls.push({ ...q });
          return Promise.resolve(respond(q)).then(resolve, reject);
        },
      };
      return b;
    },
  };
}

const PROFILE = { id: "user-1", organization_id: "org-1" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUserProfile.mockResolvedValue(PROFILE);
  mocks.validateWorkflowDefinition.mockResolvedValue({ ok: true });
  mocks.resolveOrgMcpTools.mockResolvedValue({
    targets: [],
    toolDefs: [],
    routingMap: {},
  });
});

// ---------------------------------------------------------------------------
// executeWorkflowRun
// ---------------------------------------------------------------------------

describe("executeWorkflowRun — gates", () => {
  it("rejects an unauthenticated caller (no DB touched)", async () => {
    mocks.getCurrentUserProfile.mockResolvedValue(null);
    const r = await executeWorkflowRun({ definitionId: "d1", runInput: "x" });
    expect(r).toEqual({ ok: false, error: "unauthenticated" });
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("returns not_found when the definition does not exist", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(
      makeDb((q) =>
        q.table === "workflow_definitions"
          ? { data: null, error: null }
          : { data: null, error: null },
      ),
    );
    const r = await executeWorkflowRun({ definitionId: "d1", runInput: "x" });
    expect(r).toEqual({ ok: false, error: "not_found" });
    expect(mocks.runWorkflow).not.toHaveBeenCalled();
  });

  it("returns not_runnable when the definition is not active", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(
      makeDb((q) =>
        q.table === "workflow_definitions"
          ? { data: { id: "d1", status: "draft", definition: { steps: [] } }, error: null }
          : { data: null, error: null },
      ),
    );
    const r = await executeWorkflowRun({ definitionId: "d1", runInput: "x" });
    expect(r).toEqual({ ok: false, error: "not_runnable" });
    expect(mocks.runWorkflow).not.toHaveBeenCalled();
  });

  it("returns invalid_definition (with errors) when validation fails", async () => {
    mocks.validateWorkflowDefinition.mockResolvedValue({
      ok: false,
      errors: ["a step references a missing agent"],
    });
    mocks.createSupabaseServerClient.mockResolvedValue(
      makeDb((q) =>
        q.table === "workflow_definitions"
          ? { data: { id: "d1", status: "active", definition: { steps: [] } }, error: null }
          : { data: null, error: null },
      ),
    );
    const r = await executeWorkflowRun({ definitionId: "d1", runInput: "x" });
    expect(r).toEqual({
      ok: false,
      error: "invalid_definition",
      errors: ["a step references a missing agent"],
    });
    expect(mocks.runWorkflow).not.toHaveBeenCalled();
  });

  it("returns internal_error when the run row insert fails", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(
      makeDb((q) => {
        if (q.table === "workflow_definitions")
          return { data: { id: "d1", status: "active", definition: { steps: [] } }, error: null };
        if (q.table === "workflow_runs" && q.op === "insert")
          return { data: null, error: { code: "XX000" } };
        return { data: null, error: null };
      }),
    );
    const r = await executeWorkflowRun({ definitionId: "d1", runInput: "x" });
    expect(r).toEqual({ ok: false, error: "internal_error" });
  });

  it("never throws: a thrown error resolves to internal_error", async () => {
    mocks.createSupabaseServerClient.mockRejectedValue(new Error("boom"));
    const r = await executeWorkflowRun({ definitionId: "d1", runInput: "x" });
    expect(r).toEqual({ ok: false, error: "internal_error" });
  });
});

describe("executeWorkflowRun — persistence orchestration", () => {
  it("on a completed engine run: inserts the run, persists steps, returns completed", async () => {
    const calls: Query[] = [];
    mocks.createSupabaseServerClient.mockResolvedValue(
      makeDb((q) => {
        if (q.table === "workflow_definitions")
          return { data: { id: "d1", status: "active", definition: { steps: [] } }, error: null };
        if (q.table === "workflow_runs" && q.op === "insert")
          return { data: { id: "run-1" }, error: null };
        return { data: null, error: null };
      }, calls),
    );
    mocks.runWorkflow.mockResolvedValue({
      status: "completed",
      steps: [{ stepId: "s1", stepType: "agent", status: "completed", sequence: 0 }],
      pending: undefined,
      error: null,
    });

    const r = await executeWorkflowRun({ definitionId: "d1", runInput: "x" });
    expect(r).toEqual({ ok: true, runId: "run-1", status: "completed" });
    // step rows were persisted, and the run was settled (not a pending approval).
    expect(calls.some((c) => c.table === "workflow_step_runs" && c.op === "insert")).toBe(true);
    expect(calls.some((c) => c.table === "workflow_runs" && c.op === "update")).toBe(true);
    expect(calls.some((c) => c.table === "workflow_pending_approvals")).toBe(false);
  });

  it("on an awaiting_approval engine run: persists a pending approval and returns awaiting_approval", async () => {
    const calls: Query[] = [];
    mocks.createSupabaseServerClient.mockResolvedValue(
      makeDb((q) => {
        if (q.table === "workflow_definitions")
          return { data: { id: "d1", status: "active", definition: { steps: [] } }, error: null };
        if (q.table === "workflow_runs" && q.op === "insert")
          return { data: { id: "run-2" }, error: null };
        return { data: null, error: null };
      }, calls),
    );
    mocks.runWorkflow.mockResolvedValue({
      status: "awaiting_approval",
      steps: [{ stepId: "s1", stepType: "human_checkpoint", status: "awaiting_approval", sequence: 0 }],
      pending: { kind: "checkpoint", stepId: "s1", sequence: 0, prompt: "Review?" },
      error: null,
    });

    const r = await executeWorkflowRun({ definitionId: "d1", runInput: "x" });
    expect(r).toEqual({ ok: true, runId: "run-2", status: "awaiting_approval" });
    expect(
      calls.some((c) => c.table === "workflow_pending_approvals" && c.op === "insert"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// executeWorkflowRunWith — the headless core (D-220)
// ---------------------------------------------------------------------------

/** Like makeDb, but captures insert payloads so a test can assert what was
 *  persisted (the base fake only records table + op). */
function makeCapturingDb(
  respond: (q: Query) => { data?: unknown; error?: unknown },
  inserts: Array<{ table: string; payload: unknown }>,
) {
  return {
    from(table: string) {
      const q: Query = { table, op: "select", terminal: null, count: false };
      const b = {
        select() {
          return b;
        },
        insert(payload: unknown) {
          q.op = "insert";
          inserts.push({ table, payload });
          return b;
        },
        update() {
          q.op = "update";
          return b;
        },
        eq() {
          return b;
        },
        neq() {
          return b;
        },
        order() {
          return b;
        },
        maybeSingle() {
          q.terminal = "maybeSingle";
          return Promise.resolve(respond(q));
        },
        single() {
          q.terminal = "single";
          return Promise.resolve(respond(q));
        },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          if (!q.terminal) q.terminal = "list";
          return Promise.resolve(respond(q)).then(resolve, reject);
        },
      };
      return b;
    },
  };
}

describe("executeWorkflowRunWith — headless core", () => {
  it("uses the passed client + identity, never the session, and attributes triggered_by to the passed owner (2c)", async () => {
    const inserts: Array<{ table: string; payload: unknown }> = [];
    const db = makeCapturingDb((q) => {
      if (q.table === "workflow_definitions")
        return {
          data: { id: "d1", status: "active", definition: { steps: [] } },
          error: null,
        };
      if (q.table === "workflow_runs" && q.op === "insert")
        return { data: { id: "run-9" }, error: null };
      return { data: null, error: null };
    }, inserts);
    mocks.runWorkflow.mockResolvedValue({
      status: "completed",
      steps: [],
      pending: undefined,
      error: null,
    });

    const r = await executeWorkflowRunWith({
      supabase: db as never,
      organizationId: "org-7",
      userId: "owner-9",
      definitionId: "d1",
      runInput: "x",
    });

    expect(r).toEqual({ ok: true, runId: "run-9", status: "completed" });
    // Headless: the cookie-session helpers are never consulted.
    expect(mocks.getCurrentUserProfile).not.toHaveBeenCalled();
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
    // Option 2c: the run row is attributed to the passed human owner + org.
    const runInsert = inserts.find((i) => i.table === "workflow_runs");
    const payload = runInsert?.payload as {
      triggered_by?: string;
      organization_id?: string;
    };
    expect(payload?.triggered_by).toBe("owner-9");
    expect(payload?.organization_id).toBe("org-7");
  });
});

// ---------------------------------------------------------------------------
// resumeWorkflowApproval
// ---------------------------------------------------------------------------

const PENDING = {
  id: "pa-1",
  workflow_run_id: "run-1",
  step_id: "s1",
  sequence: 0,
  kind: "write",
  pending_action: { route: {}, toolInput: {}, toolUseId: "t1" },
  status: "pending",
};
const RUN = {
  id: "run-1",
  autonomy_level: "supervised",
  run_input: null,
  definition_snapshot: { steps: [] },
  organization_id: "org-1",
};

/** A DB that serves the pending + run rows, with overrides per test. */
function resumeDb(
  over: { pending?: unknown; run?: unknown } = {},
  calls: Query[] = [],
) {
  return makeDb((q) => {
    if (q.table === "workflow_pending_approvals" && q.terminal === "maybeSingle")
      return { data: "pending" in over ? over.pending : PENDING, error: null };
    if (q.table === "workflow_runs" && q.terminal === "maybeSingle")
      return { data: "run" in over ? over.run : RUN, error: null };
    if (q.table === "workflow_step_runs" && q.op === "select")
      return { data: [], error: null };
    return { data: null, error: null };
  }, calls);
}

describe("resumeWorkflowApproval — gates + at-most-once", () => {
  it("rejects an unauthenticated caller", async () => {
    mocks.getCurrentUserProfile.mockResolvedValue(null);
    const r = await resumeWorkflowApproval({ pendingApprovalId: "pa-1", decision: "approve" });
    expect(r).toEqual({ ok: false, error: "unauthenticated" });
  });

  it("returns not_found when the pending approval is absent", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(resumeDb({ pending: null }));
    const r = await resumeWorkflowApproval({ pendingApprovalId: "pa-1", decision: "approve" });
    expect(r).toEqual({ ok: false, error: "not_found" });
  });

  it("returns already_decided when the approval is not pending", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(
      resumeDb({ pending: { ...PENDING, status: "approved" } }),
    );
    const r = await resumeWorkflowApproval({ pendingApprovalId: "pa-1", decision: "approve" });
    expect(r).toEqual({ ok: false, error: "already_decided" });
    expect(mocks.resumeWorkflow).not.toHaveBeenCalled();
  });

  it("returns not_found when the run is absent", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(resumeDb({ run: null }));
    const r = await resumeWorkflowApproval({ pendingApprovalId: "pa-1", decision: "approve" });
    expect(r).toEqual({ ok: false, error: "not_found" });
  });

  it("returns already_decided when the atomic claim was lost (claimed: false)", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(resumeDb());
    mocks.resumeWorkflow.mockResolvedValue({ claimed: false });
    const r = await resumeWorkflowApproval({ pendingApprovalId: "pa-1", decision: "approve" });
    expect(r).toEqual({ ok: false, error: "already_decided" });
  });

  it("on a claimed resume that completes: settles and returns completed", async () => {
    const calls: Query[] = [];
    mocks.createSupabaseServerClient.mockResolvedValue(resumeDb({}, calls));
    mocks.resumeWorkflow.mockResolvedValue({
      claimed: true,
      runStatus: "completed",
      segment: { steps: [], status: "completed", pending: undefined, error: null },
      pausedStepRecord: null,
    });
    const r = await resumeWorkflowApproval({ pendingApprovalId: "pa-1", decision: "approve" });
    expect(r).toEqual({ ok: true, runId: "run-1", status: "completed" });
    // the approval was settled and the run was updated.
    expect(
      calls.some((c) => c.table === "workflow_pending_approvals" && c.op === "update"),
    ).toBe(true);
    expect(calls.some((c) => c.table === "workflow_runs" && c.op === "update")).toBe(true);
  });

  it("never throws: a thrown error resolves to internal_error", async () => {
    mocks.createSupabaseServerClient.mockRejectedValue(new Error("boom"));
    const r = await resumeWorkflowApproval({ pendingApprovalId: "pa-1", decision: "approve" });
    expect(r).toEqual({ ok: false, error: "internal_error" });
  });
});
