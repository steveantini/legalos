"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const magicLinkSchema = z.object({
  email: z.string().email().max(254),
});

/**
 * Send a passwordless magic-link email.
 *
 * Supabase creates the auth user on first click if the email is new, so
 * this action is both the sign-in and first-time sign-up path. We never
 * leak whether the email exists — success and delivery failures both
 * redirect to the generic "check inbox" message.
 *
 * Real delivery failures are logged server-side without PII; structured
 * logging comes in a later session.
 */
export async function signInWithMagicLink(formData: FormData) {
  const parsed = magicLinkSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    redirect("/login?error=invalid-email");
  }

  const supabase = await createSupabaseServerClient();
  // Resolution order:
  // 1. NEXT_PUBLIC_SITE_URL — set explicitly in Vercel Production for the
  //    canonical prod URL.
  // 2. VERCEL_URL — auto-injected on every Vercel runtime (Production +
  //    Preview), unique per deploy. Lets preview branches self-test
  //    magic-link login without hardcoding URLs.
  // 3. http://localhost:3000 — local dev fallback.
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (error) {
    console.error("signInWithOtp failed");
  }

  redirect("/login?message=check-inbox");
}
