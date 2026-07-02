import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { proxy } from "./proxy";

/**
 * Proxy exemption tests for the Vercel Cron path (D-222).
 *
 * The production incident these guard against: the auth proxy matched
 * /api/cron/run-schedules, so every sessionless cron tick 307-bounced to
 * /login and never reached the route's own fail-closed CRON_SECRET gate.
 * From the database side that was indistinguishable from "no schedules due",
 * which is why it shipped unnoticed — hence a test at the proxy layer.
 *
 * Scope is deliberately minimal: exactly the cron exemption plus two
 * negative controls proving the exemption is not broader than written.
 * Broader proxy coverage (marketing paths, deactivated-user cutoff,
 * authed-on-/login bounce) is a separate follow-up, not this file's job.
 */

// The Supabase middleware client is the proxy's only dependency with I/O.
// A sessionless visitor: getUser() resolves to no user, and the pass-through
// response is a plain NextResponse (cookie handling is not under test here).
vi.mock("@/lib/supabase/middleware", async () => {
  const { NextResponse } = await import("next/server");
  return {
    createSupabaseMiddlewareClient: () => ({
      supabase: {
        auth: {
          getUser: async () => ({ data: { user: null } }),
        },
      },
      getSupabaseResponse: () => NextResponse.next(),
    }),
  };
});

function sessionlessRequestFor(path: string): NextRequest {
  return new NextRequest(`https://legalos.test${path}`);
}

describe("proxy: /api/cron/ exemption (public-but-self-defending, D-222)", () => {
  it("passes a sessionless cron tick through to the route's own CRON_SECRET gate", async () => {
    const response = await proxy(
      sessionlessRequestFor("/api/cron/run-schedules"),
    );
    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });

  it("still redirects sessionless requests on non-public paths to /login", async () => {
    const response = await proxy(sessionlessRequestFor("/workspace"));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe(
      "/login",
    );
  });

  it("does not exempt sibling paths that merely share the /api/cron string", async () => {
    const response = await proxy(sessionlessRequestFor("/api/cron-other"));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe(
      "/login",
    );
  });
});
