import { describe, expect, it } from "vitest";

import { buildDemoUserRow, interpretTokenClaim } from "./access";

describe("interpretTokenClaim (single-use / atomic claim)", () => {
  it("claims when exactly one row transitioned pending → consumed", () => {
    const result = interpretTokenClaim([
      { id: "inv-1", organization_id: "demo-org" },
    ]);
    expect(result).toEqual({
      claimed: true,
      invitationId: "inv-1",
      organizationId: "demo-org",
    });
  });

  it("does NOT claim on zero rows (already consumed / expired / a replay) — no second user is created", () => {
    expect(interpretTokenClaim([])).toEqual({ claimed: false });
  });

  it("does NOT claim on null (no match)", () => {
    expect(interpretTokenClaim(null)).toEqual({ claimed: false });
  });

  it("defensively does NOT claim if more than one row comes back", () => {
    expect(
      interpretTokenClaim([
        { id: "a", organization_id: "o" },
        { id: "b", organization_id: "o" },
      ]),
    ).toEqual({ claimed: false });
  });

  it("does NOT claim a malformed row missing the org", () => {
    expect(
      interpretTokenClaim([{ id: "inv-1", organization_id: "" }]),
    ).toEqual({ claimed: false });
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
