import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the scheduled-run tick (lib/workflows/schedule-run.ts, D-220).
 *
 * The heavy leaf modules (the service-role admin client, the headless run core)
 * are mocked so the tick logic runs over controlled fakes — the same isolation
 * approach as run.test.ts. Covers: the CRON_SECRET bearer auth, the enabled+due
 * predicate, the DI orchestrator (zero-schedules no-op, claim-gated running,
 * per-schedule isolation), the single-winner claim under a simulated double-tick,
 * and the live deps' query/claim shapes + the 2c run attribution.
 */

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  executeWorkflowRunWith: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("@/lib/workflows/run", () => ({
  executeWorkflowRunWith: mocks.executeWorkflowRunWith,
}));

import {
  buildLiveTickDeps,
  isAuthorizedCronRequest,
  isScheduleDue,
  runDueSchedules,
  type DueSchedule,
  type ScheduleTickDeps,
} from "./schedule-run";

const DUE: DueSchedule = {
  id: "sch-1",
  organizationId: "org-1",
  workflowDefinitionId: "def-1",
  ownerUserId: "owner-1",
  autonomyLevel: "supervised",
  runInput: null,
  cadenceSeconds: 900,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// isAuthorizedCronRequest — the CRON_SECRET bearer gate
// ---------------------------------------------------------------------------

describe("isAuthorizedCronRequest", () => {
  it("admits the exact `Bearer <secret>` header when a secret is configured", () => {
    expect(isAuthorizedCronRequest("Bearer s3cr3t", "s3cr3t")).toBe(true);
  });

  it("rejects a wrong secret", () => {
    expect(isAuthorizedCronRequest("Bearer nope", "s3cr3t")).toBe(false);
  });

  it("rejects a missing Authorization header", () => {
    expect(isAuthorizedCronRequest(null, "s3cr3t")).toBe(false);
  });

  it("rejects a non-bearer header shape", () => {
    expect(isAuthorizedCronRequest("s3cr3t", "s3cr3t")).toBe(false);
  });

  it("is fail-closed when no secret is configured (undefined)", () => {
    expect(isAuthorizedCronRequest("Bearer anything", undefined)).toBe(false);
  });

  it("is fail-closed when the secret is empty", () => {
    expect(isAuthorizedCronRequest("Bearer ", "")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isScheduleDue — the enabled + next_run_at <= now predicate
// ---------------------------------------------------------------------------

describe("isScheduleDue", () => {
  const now = Date.parse("2026-07-01T12:00:00.000Z");

  it("is due when enabled and next_run_at is in the past", () => {
    expect(
      isScheduleDue({ enabled: true, nextRunAt: "2026-07-01T11:59:00.000Z" }, now),
    ).toBe(true);
  });

  it("is not due when enabled but next_run_at is in the future", () => {
    expect(
      isScheduleDue({ enabled: true, nextRunAt: "2026-07-01T12:01:00.000Z" }, now),
    ).toBe(false);
  });

  it("is not due when disabled even if next_run_at is in the past", () => {
    expect(
      isScheduleDue({ enabled: false, nextRunAt: "2026-07-01T11:59:00.000Z" }, now),
    ).toBe(false);
  });

  it("is not due when disabled and in the future", () => {
    expect(
      isScheduleDue({ enabled: false, nextRunAt: "2026-07-01T12:01:00.000Z" }, now),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// runDueSchedules — the DI orchestrator
// ---------------------------------------------------------------------------

function tickDeps(over: Partial<ScheduleTickDeps> = {}): ScheduleTickDeps {
  return {
    now: () => Date.parse("2026-07-01T12:00:00.000Z"),
    selectDueSchedules: async () => [],
    claimSchedule: async () => true,
    runSchedule: async () => {},
    ...over,
  };
}

describe("runDueSchedules", () => {
  it("is a genuine no-op at zero schedules (Stage 1 dark)", async () => {
    const runSchedule = vi.fn(async () => {});
    const claimSchedule = vi.fn(async () => true);
    const result = await runDueSchedules(
      tickDeps({ selectDueSchedules: async () => [], claimSchedule, runSchedule }),
    );
    expect(result).toEqual({ due: 0, claimed: 0, ran: 0 });
    expect(claimSchedule).not.toHaveBeenCalled();
    expect(runSchedule).not.toHaveBeenCalled();
  });

  it("runs a due schedule whose claim is won", async () => {
    const runSchedule = vi.fn(async () => {});
    const result = await runDueSchedules(
      tickDeps({
        selectDueSchedules: async () => [DUE],
        claimSchedule: async () => true,
        runSchedule,
      }),
    );
    expect(result).toEqual({ due: 1, claimed: 1, ran: 1 });
    expect(runSchedule).toHaveBeenCalledWith(DUE);
  });

  it("does NOT run a due schedule whose claim is lost", async () => {
    const runSchedule = vi.fn(async () => {});
    const result = await runDueSchedules(
      tickDeps({
        selectDueSchedules: async () => [DUE],
        claimSchedule: async () => false,
        runSchedule,
      }),
    );
    expect(result).toEqual({ due: 1, claimed: 0, ran: 0 });
    expect(runSchedule).not.toHaveBeenCalled();
  });

  it("isolates a per-schedule failure so the rest of the tick still runs", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const a = { ...DUE, id: "a" };
    const b = { ...DUE, id: "b" };
    const ran: string[] = [];
    const result = await runDueSchedules(
      tickDeps({
        selectDueSchedules: async () => [a, b],
        claimSchedule: async () => true,
        runSchedule: async (s) => {
          if (s.id === "a") throw new Error("boom");
          ran.push(s.id);
        },
      }),
    );
    // 'a' claimed then threw; 'b' still ran.
    expect(ran).toEqual(["b"]);
    expect(result.due).toBe(2);
    expect(result.ran).toBe(1);
  });

  it("single-winner under a simulated double-tick: the conditional claim advances next_run_at so only one tick runs", async () => {
    // Shared in-memory schedule; the claim mimics the SQL conditional advance.
    const cadenceMs = DUE.cadenceSeconds * 1000;
    const store = { nextRunAtMs: 0, enabled: true };
    const claimSchedule = async (_s: DueSchedule, nowMs: number) => {
      if (store.enabled && store.nextRunAtMs <= nowMs) {
        store.nextRunAtMs = nowMs + cadenceMs; // the winner advances it
        return true;
      }
      return false; // a concurrent tick sees it already advanced
    };
    const ran: string[] = [];
    const deps = tickDeps({
      selectDueSchedules: async () => [DUE],
      claimSchedule,
      runSchedule: async (s) => {
        ran.push(s.id);
      },
    });
    // Two ticks fire for the same due schedule (duplicate delivery / overlap).
    const [t1, t2] = await Promise.all([
      runDueSchedules(deps),
      runDueSchedules(deps),
    ]);
    expect(ran).toEqual(["sch-1"]); // exactly one run
    expect(t1.ran + t2.ran).toBe(1);
    expect(t1.claimed + t2.claimed).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// buildLiveTickDeps — the service-role wiring (query + claim shapes, 2c)
// ---------------------------------------------------------------------------

/** A thenable Supabase chain that records every call and resolves `result`. */
function recordingAdmin(
  result: { data?: unknown; error?: unknown },
  calls: Array<{ m: string; args: unknown[] }>,
) {
  const chain: Record<string, unknown> = {};
  const rec = (m: string, ...args: unknown[]) => {
    calls.push({ m, args });
    return chain;
  };
  chain.from = (...a: unknown[]) => rec("from", ...a);
  chain.select = (...a: unknown[]) => rec("select", ...a);
  chain.update = (...a: unknown[]) => rec("update", ...a);
  chain.eq = (...a: unknown[]) => rec("eq", ...a);
  chain.lte = (...a: unknown[]) => rec("lte", ...a);
  chain.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

describe("buildLiveTickDeps", () => {
  it("selectDueSchedules filters on enabled = true AND next_run_at <= now", async () => {
    const calls: Array<{ m: string; args: unknown[] }> = [];
    mocks.createSupabaseAdminClient.mockReturnValue(
      recordingAdmin(
        {
          data: [
            {
              id: "sch-1",
              organization_id: "org-1",
              workflow_definition_id: "def-1",
              owner_user_id: "owner-1",
              autonomy_level: "supervised",
              run_input: null,
              cadence_seconds: 900,
            },
          ],
          error: null,
        },
        calls,
      ),
    );
    const deps = buildLiveTickDeps();
    const due = await deps.selectDueSchedules("2026-07-01T12:00:00.000Z");

    expect(calls).toContainEqual({ m: "eq", args: ["enabled", true] });
    expect(calls).toContainEqual({
      m: "lte",
      args: ["next_run_at", "2026-07-01T12:00:00.000Z"],
    });
    expect(due).toEqual([
      {
        id: "sch-1",
        organizationId: "org-1",
        workflowDefinitionId: "def-1",
        ownerUserId: "owner-1",
        autonomyLevel: "supervised",
        runInput: null,
        cadenceSeconds: 900,
      },
    ]);
  });

  it("claimSchedule wins when the conditional update affects exactly one row", async () => {
    const calls: Array<{ m: string; args: unknown[] }> = [];
    mocks.createSupabaseAdminClient.mockReturnValue(
      recordingAdmin({ data: [{ id: "sch-1" }], error: null }, calls),
    );
    const won = await buildLiveTickDeps().claimSchedule(DUE, 1_000_000);
    expect(won).toBe(true);
    // The claim is gated on the row still being enabled + due.
    expect(calls).toContainEqual({ m: "eq", args: ["id", "sch-1"] });
    expect(calls).toContainEqual({ m: "eq", args: ["enabled", true] });
    expect(calls.some((c) => c.m === "lte" && c.args[0] === "next_run_at")).toBe(true);
  });

  it("claimSchedule loses when the conditional update affects zero rows", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      recordingAdmin({ data: [], error: null }, []),
    );
    const won = await buildLiveTickDeps().claimSchedule(DUE, 1_000_000);
    expect(won).toBe(false);
  });

  it("runSchedule attributes the run to the schedule owner (2c: userId = ownerUserId)", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      recordingAdmin({ data: null, error: null }, []),
    );
    mocks.executeWorkflowRunWith.mockResolvedValue({
      ok: true,
      runId: "run-1",
      status: "completed",
    });
    await buildLiveTickDeps().runSchedule(DUE);
    expect(mocks.executeWorkflowRunWith).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        userId: "owner-1",
        definitionId: "def-1",
        autonomyLevel: "supervised",
      }),
    );
  });
});
