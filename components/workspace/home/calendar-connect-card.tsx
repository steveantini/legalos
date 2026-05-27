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
 * the --radius-xl scale), a border-border + bg-card frame, a mono caption
 * eyebrow, an 18px medium card title, and a muted-foreground body. The
 * 20px medium section heading ("Today") sits above the card frame, sharing
 * the unified home-section heading idiom; the card title is a plain
 * paragraph since the section already carries its <h2>. The Connect CTA
 * uses the Button primitive's `render` prop to render as a Link — Base UI's
 * polymorphism convention and this project's asChild equivalent.
 */
export function CalendarConnectCard() {
  return (
    <section
      aria-labelledby="today-section-heading"
      className="flex flex-col gap-5"
    >
      <h2
        id="today-section-heading"
        className="text-[20px] font-medium tracking-[-0.005em] text-foreground"
      >
        Today
      </h2>

      <div className="rounded-xl border border-border bg-card p-8">
        <div className="flex items-center justify-between gap-8">
          <div className="flex-1">
            <p className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-caption">
              Calendar · not yet connected
            </p>
            <p className="mb-2 text-[18px] font-medium text-foreground">
              Connect your calendar
            </p>
            <p className="max-w-[56ch] text-[14px] leading-[1.5] text-muted-foreground">
              Two clicks to wire up Google or Outlook. legalOS reads your
              free/busy and today’s schedule. We never write to your calendar.
            </p>
          </div>
          <Button
            aria-label="Connect your calendar"
            render={<Link href="/workspace/integrations/connections" />}
          >
            Connect →
          </Button>
        </div>
      </div>
    </section>
  );
}
