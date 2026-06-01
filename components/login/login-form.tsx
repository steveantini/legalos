"use client";

import { useFormStatus } from "react-dom";

import { signInWithMagicLink } from "@/app/(public)/login/actions";
import { ACCESS_REJECTION_MESSAGE } from "@/lib/auth/allowlist";

/**
 * Login form state (Session 23).
 *
 * Client component. Renders the heading + subline + email-entry form
 * with the same masked-reveal entrance vocabulary as the landing
 * hero. The heading uses `landing-line-mask` + `landing-line-up` for
 * a typewriter-style slide; the subline uses `landing-el-up`; the
 * form uses `landing-el-in`. Animation delays are tuned for a
 * ~1.5s entrance — faster than the landing hero's ~3.3s
 * choreography because this is an action surface, not a marketing
 * surface.
 *
 * The mask-release delay on the heading is overridden inline to
 * 1200ms (vs. landing's hardcoded 3060ms) so the descender on the
 * "g" in "Sign in" stays visible after the slide settles.
 *
 * useFormStatus drives the pending state on the submit button so
 * the user sees an immediate "Sending…" while the server action
 * runs.
 */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="group mt-3 inline-flex w-full items-center justify-center gap-[10px] rounded-[12px] bg-foreground px-[26px] py-4 text-[15px] font-medium text-background shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_1px_0_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.12)] transition-[transform,background-color,box-shadow] duration-200 ease-out hover:-translate-y-px hover:bg-ink-2 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_0_rgba(0,0,0,0.16),0_14px_36px_rgba(0,0,0,0.18)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Sending…" : "Send sign-in link"}
    </button>
  );
}

interface LoginFormProps {
  error?: string;
  next?: string;
}

export function LoginForm({ error, next }: LoginFormProps) {
  const errorCopy =
    error === "invalid-email"
      ? "That doesn’t look like a valid email. Try again."
      : error === "invalid-link"
        ? "This sign-in link has expired or is invalid. Enter your email to get a new one."
        : error === "access-denied"
          ? ACCESS_REJECTION_MESSAGE
          : error === "deactivated"
            ? "Your account is inactive. Contact your administrator to restore access."
            : null;

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
            Sign in
          </span>
        </span>
      </h1>

      <p
        className="landing-el-up mt-[14px] text-[16px] font-normal leading-[1.55] text-muted-foreground"
        style={{ animationDelay: "1000ms" }}
      >
        We’ll send a sign-in link to your email.
      </p>

      <div
        className="landing-el-in mt-9"
        style={{ animationDelay: "1500ms" }}
      >
        {errorCopy ? (
          <p
            role="alert"
            className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive"
          >
            {errorCopy}
          </p>
        ) : null}

        <form action={signInWithMagicLink} className="flex flex-col">
          <input type="hidden" name="next" value={next ?? "/workspace"} />
          <label htmlFor="email" className="sr-only">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full rounded-[12px] border border-border bg-background px-4 py-4 text-[15px] text-foreground placeholder:text-muted-foreground transition-colors duration-150 focus:border-primary/45 focus:outline-none focus:ring-3 focus:ring-primary/15"
          />
          <SubmitButton />
        </form>
      </div>
    </>
  );
}
