"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Sign the current user out and redirect. Clears the Supabase session cookie via
 * @supabase/ssr; the proxy gate on the next request would redirect anyway, but
 * explicit is better than implicit here.
 *
 * `redirectTo` defaults to /login (the profile-menu "Sign out"); the demo
 * banner's "Exit demo" passes "/" so a prospect lands back on the marketing
 * home (D-170). Only same-origin relative paths are honored, so the param can
 * never become an open redirect.
 */
export async function signOut(redirectTo: string = "/login") {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(redirectTo.startsWith("/") ? redirectTo : "/login");
}
