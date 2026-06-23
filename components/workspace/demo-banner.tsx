"use client";

import { useTransition } from "react";

import { signOut } from "@/lib/actions/auth";

/**
 * The "you're in a demo" banner (D-170). Rendered in the workspace shell only
 * when the current org is_demo, so a prospect always knows they are in a demo
 * and a real user who entered one by accident can leave in one click. Calm by
 * design, not an alarm. "Exit demo" reuses the signOut action, returning to the
 * marketing home rather than the login form.
 */
export function DemoBanner() {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-center gap-3 border-b border-hairline bg-primary/10 px-4 py-2 text-[13px] leading-none text-foreground">
      <span>You&rsquo;re exploring a demo of legalOS.</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await signOut("/");
          })
        }
        className="rounded-md border border-border px-2.5 py-1 text-[12px] font-medium text-foreground transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
      >
        {pending ? "Exiting…" : "Exit demo"}
      </button>
    </div>
  );
}
