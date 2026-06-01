import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware";
import { safeNextPath } from "@/lib/url/safe-next";

/**
 * Paths accessible without an auth session. Everything else is gated.
 * `/auth` covers the magic-link callback at /auth/callback. `/` is the
 * marketing landing (Session 22 Step B) and is public so anonymous
 * visitors see the landing instead of being bounced to /login.
 */
const PUBLIC_PATHS = ["/login", "/auth"];

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
  const isPublicPath =
    pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p));

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
