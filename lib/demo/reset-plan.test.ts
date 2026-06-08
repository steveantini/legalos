import { describe, expect, it } from "vitest";

import { buildResetDeletes, evaluateResetGuard, type OrgRow } from "./reset-plan";

const DEMO: OrgRow = { id: "demo-org-id", is_demo: true, slug: "demo" };
const REAL_ID = "real-org-id";

describe("evaluateResetGuard (layered, all must pass)", () => {
  it("passes only when every condition holds", () => {
    expect(
      evaluateResetGuard({
        orgIdArg: "demo-org-id",
        org: DEMO,
        realOrgId: REAL_ID,
      }),
    ).toEqual({ ok: true });
  });

  it("ABORTS when --org-id is missing (no implicit default)", () => {
    const r = evaluateResetGuard({ orgIdArg: undefined, org: DEMO, realOrgId: REAL_ID });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Missing --org-id/);
  });

  it("ABORTS when --org-id is blank", () => {
    const r = evaluateResetGuard({ orgIdArg: "   ", org: DEMO, realOrgId: REAL_ID });
    expect(r.ok).toBe(false);
  });

  it("ABORTS when the org does not exist", () => {
    const r = evaluateResetGuard({ orgIdArg: "demo-org-id", org: null, realOrgId: REAL_ID });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/No organization found/);
  });

  it("ABORTS when the loaded org id does not match the requested id", () => {
    const r = evaluateResetGuard({
      orgIdArg: "demo-org-id",
      org: { id: "other-id", is_demo: true },
      realOrgId: REAL_ID,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/does not match/);
  });

  it("ABORTS when the target org is not a demo org (is_demo false)", () => {
    const r = evaluateResetGuard({
      orgIdArg: "real-org-id",
      org: { id: "real-org-id", is_demo: false },
      realOrgId: REAL_ID,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not a demo org/);
  });

  it("ABORTS when is_demo is missing/undefined (treated as not-true)", () => {
    const r = evaluateResetGuard({
      orgIdArg: "x",
      org: { id: "x", is_demo: undefined as unknown as boolean },
      realOrgId: REAL_ID,
    });
    expect(r.ok).toBe(false);
  });

  it("ABORTS when the real org id cannot be resolved", () => {
    const r = evaluateResetGuard({ orgIdArg: "demo-org-id", org: DEMO, realOrgId: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/real org id/);
  });

  it("ABORTS when the target org id EQUALS the real org id (even if flagged demo)", () => {
    const r = evaluateResetGuard({
      orgIdArg: REAL_ID,
      org: { id: REAL_ID, is_demo: true },
      realOrgId: REAL_ID,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/is the real org/);
  });
});

describe("buildResetDeletes (every delete is org-id-scoped)", () => {
  const deletes = buildResetDeletes("demo-org-id");

  it("scopes EVERY delete to the validated demo org id", () => {
    expect(deletes.length).toBeGreaterThan(0);
    for (const d of deletes) {
      expect(d.organizationId).toBe("demo-org-id");
    }
  });

  it("only deletes user-created agents (preserving seeded agents)", () => {
    const agents = deletes.find((d) => d.table === "agents");
    expect(agents?.createdByNotNull).toBe(true);
  });

  it("includes the cascade parents (conversations, workflow_runs) and not their children", () => {
    const tables = deletes.map((d) => d.table);
    expect(tables).toContain("conversations"); // cascades messages
    expect(tables).toContain("workflow_runs"); // cascades workflow_step_runs
    expect(tables).not.toContain("messages");
    expect(tables).not.toContain("workflow_step_runs");
  });

  it("orders usage_events and conversations before agents (agent_id ON DELETE RESTRICT)", () => {
    const tables = deletes.map((d) => d.table);
    expect(tables.indexOf("usage_events")).toBeLessThan(tables.indexOf("agents"));
    expect(tables.indexOf("conversations")).toBeLessThan(tables.indexOf("agents"));
  });
});
