"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isEmailAllowed } from "@/lib/auth/allowlist";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/url/safe-next";
import { resolveSiteUrl } from "@/lib/url/site-url";

/**
 * httpOnly cookie carrying the email the user just submitted, so the
 * confirmation surface can echo it back ("We sent a sign-in link to
 * <email>"). 10-minute TTL — long enough to bridge the redirect and
 * a manual resend, short enough that a forgotten browser tab doesn't
 * preserve the email indefinitely. Path-scoped to /login so the cookie
 * never travels to /workspace or any other surface.
 *
 * The name is duplicated in `app/(public)/login/page.tsx` because
 * "use server" files can only export async functions — constants
 * cannot cross the file boundary. Keep the two literals in sync.
 */
const PENDING_EMAIL_COOKIE = "legalos_pending_email";
const PENDING_EMAIL_MAX_AGE_SECONDS = 600;

const magicLinkSchema = z.object({
  email: z.string().email().max(254),
  next: z.string().optional(),
});

/**
 * Send a passwordless magic-link email. Best-effort: errors are
 * logged without PII and never bubble up. Both success and failure
 * fall through to the same "check inbox" redirect on the call site,
 * so the response never leaks whether the email exists.
 *
 * `next` is appended as a querystring on the callback URL when it
 * differs from the default `/workspace` — keeps the email URL clean
 * in the common case.
 */
async function sendMagicLink(email: string, next: string) {
  const callbackBase = `${resolveSiteUrl()}/auth/callback`;
  const callbackUrl =
    next === "/workspace"
      ? callbackBase
      : `${callbackBase}?next=${encodeURIComponent(next)}`;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: callbackUrl,
    },
  });
  if (error) {
    // No PII per backend-security.md — only the failure flag is logged.
    console.error("signInWithOtp failed");
  }
}

async function setPendingEmailCookie(email: string) {
  const cookieStore = await cookies();
  cookieStore.set(PENDING_EMAIL_COOKIE, email, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: PENDING_EMAIL_MAX_AGE_SECONDS,
    path: "/login",
  });
}

/**
 * Send a passwordless magic-link email.
 *
 * Supabase creates the auth user on first click if the email is new, so
 * this action is both the sign-in and first-time sign-up path. We never
 * leak whether the email exists — success and delivery failures both
 * redirect to the generic "check inbox" message AND set the pending-
 * email cookie regardless of outcome (otherwise a missing cookie would
 * itself signal a delivery failure).
 */
export async function signInWithMagicLink(formData: FormData) {
  const parsed = magicLinkSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next"),
  });

  if (!parsed.success) {
    redirect("/login?error=invalid-email");
  }

  if (!(await isEmailAllowed(parsed.data.email))) {
    redirect("/login?error=access-denied");
  }

  const next = safeNextPath(parsed.data.next);

  await sendMagicLink(parsed.data.email, next);
  await setPendingEmailCookie(parsed.data.email);

  const confirmationPath =
    next === "/workspace"
      ? "/login?message=check-inbox"
      : `/login?message=check-inbox&next=${encodeURIComponent(next)}`;
  redirect(confirmationPath);
}

/**
 * Resend the magic-link email to the email captured in the pending-
 * email cookie. If the cookie is missing or invalid the action falls
 * through to the form state silently — surfacing an error for an
 * expired-cookie state would be UX noise (the user can just type the
 * email again).
 *
 * Refreshes the cookie's maxAge so a user who is mid-resend doesn't
 * get logged out of the confirmation state by the original 10-minute
 * window expiring.
 */
export async function resendMagicLink(formData: FormData) {
  const cookieStore = await cookies();
  const pendingEmail = cookieStore.get(PENDING_EMAIL_COOKIE)?.value;

  if (!pendingEmail) {
    redirect("/login");
  }

  const parsed = magicLinkSchema.safeParse({
    email: pendingEmail,
    next: formData.get("next"),
  });

  if (!parsed.success) {
    redirect("/login");
  }

  if (!(await isEmailAllowed(parsed.data.email))) {
    redirect("/login?error=access-denied");
  }

  const next = safeNextPath(parsed.data.next);

  await sendMagicLink(parsed.data.email, next);
  await setPendingEmailCookie(parsed.data.email);

  const confirmationPath =
    next === "/workspace"
      ? "/login?message=check-inbox"
      : `/login?message=check-inbox&next=${encodeURIComponent(next)}`;
  redirect(confirmationPath);
}
