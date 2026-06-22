import { describe, expect, it } from "vitest";

import { buildDemoUserRow, evaluateDemoToken, type DemoInvitationRow } from "./access";

const NOW = Date.parse("2026-06-22T12:00:00.000Z");
const future = (ms: number) => new Date(NOW + ms).toISOString();
const past = (ms: number) => new Date(NOW - ms).toISOString();

function row(overrides: Partial<DemoInvitationRow> = {}): DemoInvitationRow {
  return {
    id: "inv-1",
    organization_id: "demo-org",
    status: "active",
    expires_at: future(60_000),
    consumed_by_user_id: null,
    ...overrides,
  };
}

describe("evaluateDemoToken (time-window validity, D-166)", () => {
  it("is valid while not revoked and now < expires_at — repeatedly, not consumed", () => {
    const result = evaluateDemoToken(row(), NOW);
    expect(result).toEqual({
      valid: true,
      invitationId: "inv-1",
      organizationId: "demo-org",
      existingUserId: null,
    });
  });

  it("carries the bound user so a returning visitor maps back to the same user", () => {
    const result = evaluateDemoToken(
      row({ consumed_by_user_id: "user-7" }),
      NOW,
    );
    expect(result).toEqual({
      valid: true,
      invitationId: "inv-1",
      organizationId: "demo-org",
      existingUserId: "user-7",
    });
  });

  it("rejects a revoked link", () => {
    expect(evaluateDemoToken(row({ status: "revoked" }), NOW)).toEqual({
      valid: false,
      reason: "revoked",
    });
  });

  it("rejects an expired link (now >= expires_at)", () => {
    expect(evaluateDemoToken(row({ expires_at: past(1) }), NOW)).toEqual({
      valid: false,
      reason: "expired",
    });
    // Exactly at expiry is expired (boundary is exclusive).
    expect(evaluateDemoToken(row({ expires_at: new Date(NOW).toISOString() }), NOW)).toEqual({
      valid: false,
      reason: "expired",
    });
  });

  it("rejects a missing token", () => {
    expect(evaluateDemoToken(null, NOW)).toEqual({
      valid: false,
      reason: "not_found",
    });
  });

  it("rejects a malformed row missing the org", () => {
    expect(evaluateDemoToken(row({ organization_id: "" }), NOW)).toEqual({
      valid: false,
      reason: "malformed",
    });
  });

  it("still honors a legacy 'pending' link as a valid time-window link", () => {
    const result = evaluateDemoToken(row({ status: "pending" }), NOW);
    expect(result.valid).toBe(true);
  });
});

describe("buildDemoUserRow (always super_admin of the DEMO org, never the real org)", () => {
  it("provisions as super_admin of the demo org", () => {
    const row = buildDemoUserRow(
      { id: "demo-org", is_demo: true },
      "auth-user-1",
      "demo-abc@legalos-internal.invalid",
    );
    expect(row).toEqual({
      id: "auth-user-1",
      organization_id: "demo-org",
      email: "demo-abc@legalos-internal.invalid",
      role: "super_admin",
      is_active: true,
    });
  });

  it("REFUSES to provision into a non-demo org (the real-org safety guard)", () => {
    expect(() =>
      buildDemoUserRow(
        { id: "real-org", is_demo: false },
        "auth-user-1",
        "demo-abc@legalos-internal.invalid",
      ),
    ).toThrow(/not a demo org/);
  });
});
