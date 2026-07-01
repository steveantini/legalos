import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for native workflow actions (D-221), including the END-TO-END proof
 * (decision 4a): the renewal watcher runs THROUGH executeWorkflowRunWith and the
 * REAL engine (not a cron shortcut, not a parallel path) and produces findings.
 *
 * Only the leaf side-effect modules are mocked (the MCP resolver, the cookie
 * session helpers, the agent/tool executors that a native-only workflow never
 * calls). The engine, the validator, the native-action dispatch, and the renewal
 * scan are all REAL — the fake Supabase client is the only boundary, so the whole
 * spine (definition → run → native step → deterministic scan → finding upsert) is
 * exercised for real.
 */

const mocks = vi.hoisted(() => ({
  getCurrentUserProfile: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  resolveOrgMcpTools: vi.fn(),
}));

vi.mock("@/lib/auth/access", () => ({ getCurrentUserProfile: mocks.getCurrentUserProfile }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }));
vi.mock("@/lib/connections/mcp/agent-tools", () => ({ resolveOrgMcpTools: mocks.resolveOrgMcpTools }));
// Never invoked by a native-only workflow — stubbed so importing run.ts is light.
vi.mock("@/lib/agents/run-agent", () => ({ runAgent: vi.fn(), resumeAgent: vi.fn() }));
vi.mock("@/lib/connections/mcp/execute-tool", () => ({ executeMcpTool: vi.fn() }));
vi.mock("@/lib/connections/mcp/tool-classification", () => ({ classifyMcpTool: vi.fn() }));
// The engine, validate, native-actions, and renewal-watcher are REAL (not mocked).

import { executeWorkflowRunWith } from "@/lib/workflows/run";

import {
  NATIVE_ACTIONS_SERVER_ID,
  RENEWAL_SCAN_ACTION,
  isNativeAction,
} from "./native-actions-shared";
import { runNativeAction } from "./native-actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveOrgMcpTools.mockResolvedValue({ targets: [], toolDefs: [], routingMap: {} });
});

describe("isNativeAction", () => {
  it("matches the reserved native serverId + a known action name", () => {
    expect(isNativeAction(NATIVE_ACTIONS_SERVER_ID, RENEWAL_SCAN_ACTION)).toBe(true);
  });
  it("rejects an MCP server id or an unknown action name", () => {
    expect(isNativeAction("gdrive", RENEWAL_SCAN_ACTION)).toBe(false);
    expect(isNativeAction(NATIVE_ACTIONS_SERVER_ID, "delete_everything")).toBe(false);
  });
});

describe("runNativeAction", () => {
  it("fails honestly on an unknown action", async () => {
    const res = await runNativeAction({
      toolName: "nope",
      supabase: {} as never,
      organizationId: "org-1",
      workflowRunId: "run-1",
      args: {},
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Unknown native action");
  });

  it("routes the renewal action to the scan (skips without schedule context)", async () => {
    const res = await runNativeAction({
      toolName: RENEWAL_SCAN_ACTION,
      supabase: {} as never,
      organizationId: "org-1",
      workflowRunId: "run-1",
      args: { config: { windowDays: 30 } }, // no collectionId/scheduleId
    });
    expect(res.ok).toBe(true);
    expect(res.output).toMatchObject({ skipped: true });
  });
});

// ---------------------------------------------------------------------------
// END-TO-END through executeWorkflowRunWith (decision 4a)
// ---------------------------------------------------------------------------

const NATIVE_STEP = {
  id: "scan-renewals",
  type: "tool_action",
  name: "Scan for upcoming renewals",
  serverId: NATIVE_ACTIONS_SERVER_ID,
  toolName: RENEWAL_SCAN_ACTION,
  argMapping: { config: { source: "run_input" } },
};
const ACTIVE_DEF = {
  id: "def-1",
  status: "active",
  definition: { steps: [NATIVE_STEP] },
};

const DB_DOCS = [
  { document_id: "doc-a", title: "Acme Corp Master Services Agreement" },
  { document_id: "doc-b", title: "Bellini Holdings NDA" },
  { document_id: "doc-c", title: "Maddox Legal Retainer" },
];
function ex(docId: string, key: string, type: string, dateV: string | null, boolV: boolean | null) {
  return {
    document_id: docId,
    attribute_key: key,
    attribute_type: type,
    found: true,
    value_text: dateV ?? String(boolV),
    value_number: null,
    value_date: dateV,
    value_boolean: boolV,
    citation_verified: true,
    source_read_incomplete: false,
  };
}
// All three expire soon (relative to a real "now" well before these dates).
const DB_EX = [
  ex("doc-a", "expiration_date", "date", "2026-07-16", null), ex("doc-a", "auto_renew", "boolean", null, false),
  ex("doc-b", "expiration_date", "date", "2026-07-20", null), ex("doc-b", "auto_renew", "boolean", null, true),
  ex("doc-c", "expiration_date", "date", "2026-07-25", null), ex("doc-c", "auto_renew", "boolean", null, false),
];

type Captured = { rows?: Array<Record<string, unknown>>; opts?: { onConflict: string; ignoreDuplicates: boolean } };

/** A fake Supabase serving BOTH the run-orchestration reads/writes AND the native
 *  scan's collection/extraction reads, capturing the watcher_findings upsert. */
function e2eDb(captured: Captured) {
  const ok = (data: unknown) => Promise.resolve({ data, error: null });
  return {
    from(table: string) {
      if (table === "workflow_definitions") {
        const b: Record<string, unknown> = { select: () => b, eq: () => b, maybeSingle: () => ok(ACTIVE_DEF) };
        return b;
      }
      if (table === "workflow_runs") {
        return {
          insert: () => ({ select: () => ({ single: () => ok({ id: "run-e2e" }) }) }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      if (table === "workflow_step_runs") {
        return { insert: () => Promise.resolve({ error: null }) };
      }
      if (table === "collection_documents") {
        const b: Record<string, unknown> = { select: () => b, eq: () => b, not: () => ok(DB_DOCS) };
        return b;
      }
      if (table === "document_extractions") {
        const b: Record<string, unknown> = { select: () => b, in: () => ok(DB_EX) };
        return b;
      }
      // watcher_findings
      return {
        upsert: (rows: Array<Record<string, unknown>>, opts: { onConflict: string; ignoreDuplicates: boolean }) => {
          captured.rows = rows;
          captured.opts = opts;
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

describe("renewal watcher end-to-end through executeWorkflowRunWith (decision 4a)", () => {
  it("runs the real engine + native step and upserts one finding per hit", async () => {
    const captured: Captured = {};
    const result = await executeWorkflowRunWith({
      supabase: e2eDb(captured) as never,
      organizationId: "org-1",
      userId: "owner-1",
      definitionId: "def-1",
      runInput: {
        collectionId: "col-1",
        scheduleId: "sch-1",
        // A large window so all three fixtures are "expiring within N days"
        // regardless of the real wall-clock date this test runs on.
        windowDays: 4000,
        findingKind: "renewal",
        isFixture: true,
      },
    });

    // The run completed through the engine (not a shortcut), producing findings.
    expect(result).toEqual({ ok: true, runId: "run-e2e", status: "completed" });
    expect(captured.rows).toHaveLength(3); // one finding per hit (decision 1b)
    expect(captured.opts?.ignoreDuplicates).toBe(true); // idempotent (decision 2)
    const subjects = captured.rows!.map((r) => r.subject_ref).sort();
    expect(subjects).toEqual(["doc-a", "doc-b", "doc-c"]);
    // Attributed + flagged correctly.
    expect(captured.rows!.every((r) => r.schedule_id === "sch-1")).toBe(true);
    expect(captured.rows!.every((r) => r.run_id === "run-e2e")).toBe(true);
    expect(captured.rows!.every((r) => r.is_fixture === true)).toBe(true);
    // The session helpers were never consulted (headless).
    expect(mocks.getCurrentUserProfile).not.toHaveBeenCalled();
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });
});
