import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware";
import { safeNextPath } from "@/lib/url/safe-next";

/**
 * Paths accessible without an auth session. Everything else is gated.
 * `/auth` covers the magic-link callback at /auth/callback. `/` is the
 * marketing landing (Session 22 Step B) and is public so anonymous
 * visitors see the landing instead of being bounced to /login. `/demo`
 * covers the demo access link (/demo/<token>) and its /demo/unavailable
 * page: an unauthenticated prospect must reach the consume route, which
 * establishes their session server-side and then redirects into /workspace.
 * `/api/support` is the support assistant's endpoint (D-160): anonymous by
 * design once public, and self-gating while in owner-only preview (the
 * route 404s non-owners itself), so the public flip never needs a proxy
 * edit.
 * `/api/cron/` covers the Vercel Cron routes (D-222): the proxy passes
 * them through, and each route's fail-closed CRON_SECRET bearer check
 * (401 on a wrong or absent secret) is the real gate — the same
 * public-but-self-defending model as `/api/support`. Without this
 * exemption the sessionless cron tick 307-bounces to /login and never
 * reaches the handler. The trailing slash keeps the prefix exact-scoped:
 * a sibling path like `/api/cron-other` stays gated.
 */
const PUBLIC_PATHS = ["/login", "/auth", "/demo", "/api/support", "/api/cron/"];

/**
 * Marketing pages, matched exactly. They live in the `app/(marketing)/`
 * route group, whose segment never appears in the URL, so the proxy
 * cannot infer them — each public marketing path is listed explicitly.
 * All are linked from the public landing footer and must be reachable
 * anonymously (before D-126 they were accidentally login-gated, bouncing
 * visitors to /login). `/security`, `/integrations`, and `/connections`
 * stay listed even though they now permanently redirect (to /trust and
 * to /features#governance), and `/blog` even though it temporarily
 * redirects to /about (retired shell, D-159): the proxy runs first, and
 * an anonymous hit must reach the route's redirect instead of a /login
 * bounce.
 */
const PUBLIC_MARKETING_PATHS = [
  "/about",
  "/blog",
  "/connections",
  "/contact",
  "/documentation",
  "/faq",
  "/features",
  "/integrations",
  "/legal",
  "/legal/terms",
  "/legal/privacy",
  "/legal/dpa",
  "/legal/subprocessors",
  "/mission",
  "/pricing",
  "/security",
  "/support",
  "/trust",
  "/trust/security",
  "/trust/control",
  "/trust/privacy",
];

/**
 * Auth gate + first-login user provisioning.
 *
 * Next.js 16 renamed the file convention from `middleware.ts` to `proxy.ts`
 * (see DECISION_LOG.md D-017). The API is identical; the filename and
 * exported function name are the only changes.
 *
 * 1. Verifies a Supabase session via `getUser()` — server-validated per
 *    supabase.md gotcha #7 (`getSession()` reads stale local state and
 *    must not be used here).
 * 2. Unauthenticated requests to non-public paths redirect to /login,
 *    preserving the requested path as `?next=<path>` so the user lands
 *    back where they were going after sign-in. The value is validated
 *    via safeNextPath (same-origin relative only) before being appended.
 * 3. Deactivated users (A3b): an authenticated user whose `public.users`
 *    row has `is_active = false` is signed out and bounced to /login with
 *    `?error=deactivated`. This is the mid-session cutoff — it runs on every
 *    request (pages, API routes, server-action POSTs), so deactivation takes
 *    effect on the user's very next request without waiting for re-login. A
 *    user with no row yet (brand-new, not provisioned) is NOT blocked: no row
 *    is not the same as inactive, and provisioning creates them active. The
 *    sign-out clears the session so the redirect to /login can't loop back
 *    through the authed-on-/login bounce below.
 * 4. Authenticated, active requests call `ensure_user_provisioned()` so the
 *    user has a `public.users` row. The RPC is idempotent and best effort;
 *    failures are logged but never block the request.
 *
 * CRITICAL: returning anything other than `getSupabaseResponse()` (or an
 * equivalent response carrying its cookies) drops the refreshed session
 * cookie and silently logs the user out on the next request.
 */
export async function proxy(request: NextRequest) {
  const { supabase, getSupabaseResponse } =
    createSupabaseMiddlewareClient(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  // `/` is matched exactly so the prefix-style PUBLIC_PATHS check below
  // doesn't accidentally allowlist every path that starts with `/`.
  // `/documentation/` is the one deliberate marketing PREFIX (D-158): the
  // guides under it are data-driven slugs that grow with the product, and
  // the route 404s unknown slugs itself, so prefix-allowlisting exposes
  // nothing beyond the published guides — while exact-listing them would
  // make every new guide a proxy edit away from a public /login bounce.
  const isPublicPath =
    pathname === "/" ||
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    PUBLIC_MARKETING_PATHS.includes(pathname) ||
    pathname.startsWith("/documentation/");

  if (!user && !isPublicPath) {
    const requestedPath = request.nextUrl.pathname + request.nextUrl.search;
    const next = safeNextPath(requestedPath);
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (next !== "/workspace") {
      url.searchParams.set("next", next);
    }
    const response = NextResponse.redirect(url);
    // Carry the refreshed session cookies from getSupabaseResponse() so
    // the redirect doesn't drop them (per the file's CRITICAL note).
    for (const cookie of getSupabaseResponse().cookies.getAll()) {
      response.cookies.set(cookie);
    }
    return response;
  }

  // Deactivated-user cutoff (A3b). Runs before the authed-on-/login bounce so
  // a blocked user is signed out and lands on /login, not redirected back to
  // /workspace into a loop. A missing row (maybeSingle → null) means the user
  // is not provisioned yet and is treated as active-by-default (no block).
  if (user) {
    const { data: status } = await supabase
      .from("users")
      .select("is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (status?.is_active === false) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("error", "deactivated");
      const response = NextResponse.redirect(url);
      // Carry the (sign-out-cleared) cookies so the session is actually
      // dropped; otherwise the next request would still look authenticated.
      for (const cookie of getSupabaseResponse().cookies.getAll()) {
        response.cookies.set(cookie);
      }
      return response;
    }
  }

  // Authed users hitting /login go straight to /workspace — they don't
  // need to see the form again. /auth/callback stays reachable so an
  // already-authed user clicking an old magic link still hits the
  // exchange handler and is redirected to their `?next=` (or workspace).
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/workspace";
    url.search = "";
    const response = NextResponse.redirect(url);
    // Carry the refreshed session cookies from getSupabaseResponse() so
    // the redirect doesn't drop them (per the file's CRITICAL note).
    for (const cookie of getSupabaseResponse().cookies.getAll()) {
      response.cookies.set(cookie);
    }
    return response;
  }

  if (user) {
    const { error } = await supabase.rpc("ensure_user_provisioned");
    if (error) {
      // Provisioning is a best-effort side effect. A failure does not
      // block the request; the user may see a 404 on department pages
      // until provisioning succeeds or the seed runs. Only the Postgres
      // error code is logged (no PII per backend-security.md).
      console.error("ensure_user_provisioned failed", { code: error.code });
    }
  }

  return getSupabaseResponse();
}

/**
 * Run on every request except Next.js internals and common static assets.
 * Assets can't be auth-gated anyway; excluding them keeps Edge budget for
 * real requests.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf)$).*)",
  ],
};
