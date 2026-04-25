"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Sign the current user out and redirect to /login. Clears the Supabase
 * session cookie via @supabase/ssr; the proxy gate on the next request
 * would redirect anyway, but explicit is better than implicit here.
 */
export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
