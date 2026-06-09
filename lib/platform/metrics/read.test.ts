import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Locks the missing-view tolerance of the metric read seam (analytics arc, Step
 * 1). Migrations are hand-applied after deploy, so the deployed app must survive
 * querying a view that does not exist yet: a missing relation or absent
 * schema-cache entry, an unexpected DB error, and a failure to even construct the
 * admin client (no service-role key) must ALL degrade to { ok: false } so the
 * tile renders a calm empty state, never a 500.
 *
 * The Supabase admin client is a small in-memory fake (the project's established
 * pattern): from(view).select("*") resolves to a configured { data, error }.
 */

const mocks = vi.hoisted(() => ({ createSupabaseAdminClient: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import { readMetricView } from "./read";

function clientReturning(result: { data: unknown; error: unknown }) {
  return {
    from: () => ({
      select: async () => result,
    }),
  };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("readMetricView", () => {
  it("returns ok:true with the rows on success", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      clientReturning({ data: [{ active_orgs: 2 }], error: null }),
    );
    const r = await readMetricView("operator_usage_summary");
    expect(r).toEqual({ ok: true, rows: [{ active_orgs: 2 }] });
  });

  it("returns ok:true with [] when data is null and there is no error", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      clientReturning({ data: null, error: null }),
    );
    const r = await readMetricView("operator_org_health");
    expect(r).toEqual({ ok: true, rows: [] });
  });

  it("tolerates a missing relation (42P01) -> ok:false, no log", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createSupabaseAdminClient.mockReturnValue(
      clientReturning({ data: null, error: { code: "42P01" } }),
    );
    const r = await readMetricView("operator_org_health");
    expect(r).toEqual({ ok: false });
    expect(spy).not.toHaveBeenCalled();
  });

  it("tolerates an absent schema-cache entry (PGRST205) -> ok:false", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      clientReturning({ data: null, error: { code: "PGRST205" } }),
    );
    expect(await readMetricView("operator_usage_daily")).toEqual({ ok: false });
  });

  it("fails closed on an unexpected error, and logs it (code only)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createSupabaseAdminClient.mockReturnValue(
      clientReturning({ data: null, error: { code: "42501" } }),
    );
    const r = await readMetricView("operator_org_health");
    expect(r).toEqual({ ok: false });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the admin client cannot be constructed", async () => {
    mocks.createSupabaseAdminClient.mockImplementation(() => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
    });
    expect(await readMetricView("operator_usage_daily")).toEqual({ ok: false });
  });
});
