import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Persistent "Connect your calendar" card on the workspace home, mounted
 * between the greeting and Continue Working. Honest placeholder state:
 * the calendar is not yet connected, so the card says exactly that and
 * routes the Connect button to /workspace/integrations/connections, where
 * the eventual OAuth flow will live.
 *
 * Server component — no async data in v1. When calendar OAuth ships
 * (connector hub on the roadmap), this surface becomes the day's schedule
 * view backed by real data; the card frame and placement stay put.
 *
 * Visual vocabulary follows Direction A / Stage 1: rounded-xl (14px via
 * the --radius-xl scale), a border-border + bg-card frame (the real card
 * token, not the latent border-card-border no-op flagged for Stage 7), a
 * mono caption eyebrow, a 22px medium section heading, and a
 * muted-foreground body. The Connect CTA uses the Button primitive's
 * `render` prop to render as a Link — Base UI's polymorphism convention
 * and this project's asChild equivalent.
 */
export function CalendarConnectCard() {
  return (
    <section
      aria-labelledby="calendar-connect-heading"
      className="rounded-xl border border-border bg-card p-8 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_1px_0_rgba(26,24,22,0.03),0_12px_28px_-18px_rgba(26,24,22,0.10)]"
    >
      <div className="flex items-center justify-between gap-8">
        <div className="flex-1">
          <p className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-caption">
            Calendar · not yet connected
          </p>
          <h2
            id="calendar-connect-heading"
            className="mb-2 text-[22px] font-medium tracking-[-0.015em] text-foreground"
          >
            Connect your calendar
          </h2>
          <p className="max-w-[56ch] text-[14px] leading-[1.5] text-muted-foreground">
            Two clicks to wire up Google or Outlook. legalOS reads your
            free/busy and today’s schedule. We never write to your calendar.
          </p>
        </div>
        <Button render={<Link href="/workspace/integrations/connections" />}>
          Connect →
        </Button>
      </div>
    </section>
  );
}
