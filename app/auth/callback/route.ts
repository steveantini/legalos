import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Magic-link / OAuth callback.
 *
 * Supabase redirects the user here after they click a magic-link email
 * with a one-time `code` query parameter. We exchange that code for a
 * session (which @supabase/ssr writes into httpOnly cookies) and then
 * redirect to the intended next URL.
 *
 * `next` is validated to be a same-origin relative path to prevent
 * open-redirect attacks via a hostile magic-link URL.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/";
  const next =
    nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=invalid-link`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=invalid-link`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
