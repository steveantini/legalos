import { describe, expect, it, vi } from "vitest";

/**
 * getConnectionPolicy per-org default behavior (0066). After connection_policy
 * became one row per org, the resolver relies on RLS to return the CALLER'S OWN
 * org row (current_org_id()); these tests cover the absent-vs-error fork around
 * that read:
 *   - a genuinely ABSENT row (a new org with no policy yet) → the permissive
 *     seeded default, so a new org behaves like the out-of-box product, never
 *     another org's policy;
 *   - a read ERROR → fail closed (deny everything).
 *
 * Each test uses vi.resetModules() + a fresh dynamic import so the module's
 * React cache() does not bleed results across cases. The cross-org RLS
 * enforcement itself (that org A's read can't see org B's row) is a database
 * guarantee a live-Postgres harness would cover; here we verify the
 * application-layer default logic the resolver applies on top of it.
 */

function makeServer(result: { data: unknown; error: unknown }) {
  return {
    from: () => ({
      select: () => ({
        maybeSingle: async () => result,
      }),
    }),
  };
}

describe("getConnectionPolicy — per-org default vs fail-closed (0066)", () => {
  it("returns the PERMISSIVE seeded default when the org has no policy row (absent, no error)", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: async () => makeServer({ data: null, error: null }),
    }));
    const { getConnectionPolicy } = await import("./policy");
    const policy = await getConnectionPolicy();
    expect(policy.allowed_categories.length).toBeGreaterThan(0);
    expect(policy.allowed_providers.length).toBeGreaterThan(0);
    expect(policy.default_capability_ceiling).toEqual(["read"]);
  });

  it("FAILS CLOSED (denies everything) on a read error", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: async () =>
        makeServer({ data: null, error: { code: "XX000" } }),
    }));
    const { getConnectionPolicy } = await import("./policy");
    const policy = await getConnectionPolicy();
    expect(policy.allowed_categories).toEqual([]);
    expect(policy.allowed_providers).toEqual([]);
    expect(policy.default_capability_ceiling).toEqual([]);
  });

  it("returns the org's stored policy when a row is present", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: async () =>
        makeServer({
          data: {
            organization_id: "org-x",
            allowed_categories: ["mcp"],
            allowed_providers: [],
            default_capability_ceiling: ["read", "write"],
            updated_by_user_id: null,
            updated_at: "t",
          },
          error: null,
        }),
    }));
    const { getConnectionPolicy } = await import("./policy");
    const policy = await getConnectionPolicy();
    expect(policy.organization_id).toBe("org-x");
    expect(policy.allowed_categories).toEqual(["mcp"]);
    expect(policy.default_capability_ceiling).toEqual(["read", "write"]);
  });
});
