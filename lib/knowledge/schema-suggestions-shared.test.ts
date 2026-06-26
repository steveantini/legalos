import { describe, expect, it } from "vitest";

import { canApproveSchemaSuggestion } from "./schema-suggestions-shared";

/**
 * The approval gate is the one place that decides who may grow a schema. These
 * tests pin the locked phase-two default (super admin approves) so a future
 * tweak is a deliberate, visible change here.
 */
describe("canApproveSchemaSuggestion (the single approval gate)", () => {
  const collection = { id: "c1" };

  it("allows a super admin", () => {
    expect(canApproveSchemaSuggestion({ role: "super_admin" }, collection)).toBe(true);
  });

  it("denies an org admin and a plain member (phase-two default)", () => {
    expect(canApproveSchemaSuggestion({ role: "org_admin" }, collection)).toBe(false);
    expect(canApproveSchemaSuggestion({ role: "user" }, collection)).toBe(false);
  });

  it("denies a null/undefined profile", () => {
    expect(canApproveSchemaSuggestion(null)).toBe(false);
    expect(canApproveSchemaSuggestion(undefined)).toBe(false);
  });
});
