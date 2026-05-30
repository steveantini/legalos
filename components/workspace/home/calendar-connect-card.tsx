import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  getTodaysEvents,
  isCalendarConnected,
} from "@/lib/workspace/home/calendar-connection";

import { TodaySchedule } from "./today-schedule";

type CalendarConnectCardProps = {
  userId: string;
};

/**
 * The workspace home "Today" card, mounted in the top two-column row beside
 * the Impact band. Its interior branches on the calendar connection gate:
 *
 * - Not connected (always, for now): the honest "Connect your calendar"
 *   placeholder — it says exactly that and routes the Connect button to
 *   /workspace/settings/connections, where the eventual OAuth flow lives.
 * - Connected (never yet, but built): today's schedule via `TodaySchedule`.
 *
 * `isCalendarConnected` returns false until calendar OAuth ships (Share and
 * connector hub arc, roadmap item 2), so the placeholder is the only state any
 * user sees today; the schedule view is built and dormant behind the gate.
 *
 * Async server component — it awaits the connection check (and, when
 * connected, the day's events). No Suspense boundary: the check resolves
 * immediately today, so there is no latency to mask; a boundary can be added
 * alongside the real provider fetch when OAuth lands.
 *
 * Visual vocabulary follows Direction A / Stage 1: rounded-xl (14px via the
 * --radius-xl scale), a border-border + bg-card frame, a mono caption eyebrow,
 * a 17px medium card title, and a muted-foreground body. The 18px medium
 * section heading ("Today") sits above the card frame, sharing the unified
 * home-section heading idiom; the Connect CTA uses the Button primitive's
 * `render` prop to render as a Link — Base UI's polymorphism convention and
 * this project's asChild equivalent.
 *
 * The card fills its grid column (h-full / flex-1) to stay equal-height with
 * the Impact band; the frame and the "Today" heading are identical across both
 * interior states.
 */
export async function CalendarConnectCard({
  userId,
}: CalendarConnectCardProps) {
  const connected = await isCalendarConnected(userId);
  const events = connected ? await getTodaysEvents(userId) : [];

  return (
    <section
      aria-labelledby="today-section-heading"
      className="flex h-full flex-col gap-3.5"
    >
      <div className="flex h-9 items-center">
        <h2
          id="today-section-heading"
          className="text-[18px] font-medium tracking-[-0.005em] text-foreground"
        >
          Today
        </h2>
      </div>

      <div className="flex flex-1 flex-col rounded-xl border border-border bg-card p-5">
        {connected ? (
          <TodaySchedule events={events} />
        ) : (
          <>
            <p className="mb-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-caption">
              Calendar · not yet connected
            </p>
            <p className="mb-1.5 text-[17px] font-medium text-foreground">
              Connect your calendar
            </p>
            <p className="max-w-[56ch] text-[13px] leading-[1.45] text-muted-foreground">
              Two clicks to wire up Google or Outlook. legalOS reads your
              free/busy and today’s schedule. We never write to your calendar.
            </p>
            <Button
              aria-label="Connect your calendar"
              render={<Link href="/workspace/settings/connections" />}
              className="mt-4 self-start"
            >
              Connect →
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
