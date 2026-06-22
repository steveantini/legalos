import { describe, expect, it } from "vitest";

import { parseSeedTemplateArgs } from "./seed-workflow-templates";

/**
 * The seeder gained an optional --org-id so the Demo Org can carry the starter
 * template gallery. These cover the arg parse — the one branch that decides
 * which org gets seeded — and pin the backward-compatible default (no flag →
 * undefined → the script's original "oldest org" behavior).
 */
describe("parseSeedTemplateArgs", () => {
  it("returns undefined orgId with no args (default: the oldest org, unchanged)", () => {
    expect(parseSeedTemplateArgs([])).toEqual({ orgId: undefined });
  });

  it("reads --org-id=<id>", () => {
    expect(
      parseSeedTemplateArgs(["--org-id=0941c2c1-9e0f-4a3d-863b-a3686bde3493"]),
    ).toEqual({ orgId: "0941c2c1-9e0f-4a3d-863b-a3686bde3493" });
  });

  it("treats an empty or whitespace-only --org-id= as absent", () => {
    expect(parseSeedTemplateArgs(["--org-id="])).toEqual({ orgId: undefined });
    expect(parseSeedTemplateArgs(["--org-id=   "])).toEqual({ orgId: undefined });
  });

  it("ignores unrelated args around the flag", () => {
    expect(parseSeedTemplateArgs(["--foo", "--org-id=demo", "bar"])).toEqual({
      orgId: "demo",
    });
  });

  it("takes the last --org-id when repeated", () => {
    expect(parseSeedTemplateArgs(["--org-id=a", "--org-id=b"])).toEqual({
      orgId: "b",
    });
  });
});
