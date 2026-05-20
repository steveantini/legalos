import { NextResponse } from "next/server";

import { isEmailAllowed } from "@/lib/auth/allowlist";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/url/safe-next";

/**
 * Magic-link / OAuth callback.
 *
 * Supabase redirects the user here after they click a magic-link email
 * with a one-time `code` query parameter. We exchange that code for a
 * session (which @supabase/ssr writes into httpOnly cookies), verify
 * the resulting email against the allowlist (defense in depth — the
 * sign-in action already rejects unlisted emails before the link is
 * sent), and then redirect to the intended next URL.
 *
 * `next` is validated via safeNextPath to be a same-origin relative path,
 * preventing open-redirect attacks via a hostile magic-link URL.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=invalid-link`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=invalid-link`);
  }

  const email = data.user?.email;
  if (!email) {
    // Session created without an email is unexpected for the magic-link
    // flow; treat as an invalid link rather than denying access.
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=invalid-link`);
  }

  if (!isEmailAllowed(email)) {
    // Clear the session that was just created so the redirect target
    // (and the proxy's authed-on-/login guard) sees an unauthenticated
    // request.
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=access-denied`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
