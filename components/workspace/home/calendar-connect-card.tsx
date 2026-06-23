import { Button } from "@/components/ui/button";
import { HelpLink } from "@/components/workspace/help-link";
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
 * - Not connected: a one-click "Connect Google Calendar" that links to the
 *   generic OAuth start route (`/api/connections/connect?provider=google-calendar`).
 * - Connected: today's real schedule via `TodaySchedule`, fed by
 *   `getTodaysEvents` (read-only Google Calendar).
 *
 * `isCalendarConnected` reads live connection state; a user sees the Connect
 * state until they connect Google Calendar, then the schedule. The card reads
 * read-only and never writes (calendar.events.readonly scope), which the copy
 * states.
 *
 * Async server component — it awaits the connection check (and, when
 * connected, the day's events). No Suspense boundary today: the gate check is a
 * quick DB read; the events fetch runs only in the connected branch and is fast
 * enough inline, with a boundary an easy later addition if needed.
 *
 * Visual vocabulary follows Direction A / Stage 1: rounded-xl (14px via the
 * --radius-xl scale), a border-border + bg-card frame, a mono caption eyebrow,
 * a 17px medium card title, and a muted-foreground body. The 18px medium
 * section heading ("Today") sits above the card frame, sharing the unified
 * home-section heading idiom; the Connect CTA uses the Button primitive's
 * `render` prop to render as a plain anchor (the OAuth start is a full-page GET,
 * not client navigation).
 *
 * The card fills its grid column (h-full / flex-1) to stay equal-height with
 * the Impact band; the frame and the "Today" heading are identical across both
 * interior states.
 */
export async function CalendarConnectCard({
  userId,
}: CalendarConnectCardProps) {
  const connected = await isCalendarConnected(userId);
  const today = connected ? await getTodaysEvents(userId) : null;

  return (
    <section
      aria-labelledby="today-section-heading"
      className="flex h-full flex-col gap-3.5"
    >
      <div className="flex h-9 items-center justify-between">
        <h2
          id="today-section-heading"
          className="text-[18px] font-medium tracking-[-0.005em] text-foreground"
        >
          Today
        </h2>
        <HelpLink topic="calendar" />
      </div>

      <div className="flex flex-1 flex-col rounded-xl border border-border bg-card p-5">
        {today?.status === "ok" ? (
          <TodaySchedule events={today.events} />
        ) : today?.status === "needs_reconnect" ? (
          // The connection is healthy but was granted before the calendar-list
          // scope existed, so it can read its primary calendar but not enumerate
          // all the user's calendars. Prompt a reconnect (from Settings, where
          // disconnect + connect both live) rather than showing an empty day.
          <>
            <p className="mb-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-caption">
              Calendar · reconnect needed
            </p>
            <p className="mb-1.5 text-[17px] font-medium text-foreground">
              Reconnect to see all your calendars
            </p>
            <p className="max-w-[56ch] text-[13px] leading-[1.45] text-muted-foreground">
              The Today card now shows every calendar you keep visible, not just
              your main one. Reconnect Google Calendar to grant read-only access
              to your calendar list. legalOS still never writes to your calendar.
            </p>
            <Button
              variant="outline"
              render={<a href="/workspace/settings/connections" />}
              className="mt-4 self-start"
            >
              Reconnect Google Calendar →
            </Button>
          </>
        ) : (
          <>
            <p className="mb-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-caption">
              Calendar · not connected
            </p>
            <p className="mb-1.5 text-[17px] font-medium text-foreground">
              Connect your calendar
            </p>
            <p className="max-w-[56ch] text-[13px] leading-[1.45] text-muted-foreground">
              Connect Google Calendar and today’s schedule shows up here. legalOS
              reads every calendar you keep visible, and never writes to your
              calendar.
            </p>
            <Button
              aria-label="Connect Google Calendar"
              render={
                <a href="/api/connections/connect?provider=google-calendar" />
              }
              className="mt-4 self-start"
            >
              Connect Google Calendar →
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
