"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";

import { resendMagicLink } from "@/app/(public)/login/actions";

/**
 * Login confirmation state (Session 23).
 *
 * Client component. Renders after the user submits an email and the
 * server action redirects to /login?message=check-inbox. Mirrors the
 * form state's masked-reveal entrance: heading, then subline echoing
 * the email back to the user, then a row of two tertiary text
 * actions (Resend / Use a different email).
 *
 * The email is read server-side from the legalos_pending_email
 * cookie and passed as a prop; if the cookie is missing or expired
 * the prop arrives null and the subline degrades gracefully to a
 * generic "your email" variant.
 *
 * Resend is a real <form action={resendMagicLink}> + <button> so
 * useFormStatus drives the pending state. Use-a-different-email is a
 * real <Link> back to /login (no querystring) — the proxy preserves
 * the legalos_pending_email cookie, but the form-state branch
 * ignores it.
 */
function ResendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-[13px] text-muted-foreground transition-colors duration-[180ms] hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Resending…" : "Resend link"}
    </button>
  );
}

interface LoginConfirmationProps {
  email: string | null;
  next?: string;
}

export function LoginConfirmation({ email, next }: LoginConfirmationProps) {
  return (
    <>
      <h1 className="text-[36px] font-normal leading-[1.04] tracking-[-0.03em] text-foreground min-[720px]:text-[48px]">
        <span
          className="landing-line-mask block pb-[0.18em]"
          style={{ animationDelay: "1200ms" }}
        >
          <span
            className="landing-line-up block"
            style={{ animationDelay: "200ms" }}
          >
            Check your email
          </span>
        </span>
      </h1>

      <p
        role="status"
        className="landing-el-up mt-[14px] text-[16px] font-normal leading-[1.55] text-muted-foreground"
        style={{ animationDelay: "1000ms" }}
      >
        {email ? (
          <>
            We sent a sign-in link to{" "}
            <strong className="font-medium text-foreground">{email}</strong>.
            Click the link to sign in.
          </>
        ) : (
          <>We sent a sign-in link to your email. Click the link to sign in.</>
        )}
      </p>

      <div
        className="landing-el-in mt-9 flex items-center gap-3 text-[13px] text-muted-foreground"
        style={{ animationDelay: "1500ms" }}
      >
        <form action={resendMagicLink}>
          <input type="hidden" name="next" value={next ?? "/workspace"} />
          <ResendButton />
        </form>
        <span aria-hidden>·</span>
        <Link
          href={
            next && next !== "/workspace"
              ? `/login?next=${encodeURIComponent(next)}`
              : "/login"
          }
          className="text-muted-foreground transition-colors duration-[180ms] hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Use a different email
        </Link>
      </div>
    </>
  );
}
