import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware";

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
 * 2. Unauthenticated requests to non-public paths redirect to /login.
 *    No `?next=` param in this session by design — return-to-destination
 *    is deferred until there's a real need for it.
 * 3. Authenticated requests call `ensure_user_provisioned()` so the user
 *    has a `public.users` row. The RPC is idempotent and best effort;
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
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
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
