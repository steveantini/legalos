import { LocalDate } from "@/components/workspace/local-date";
import type { NormalizedEvent } from "@/lib/workspace/home/calendar-connection";

import { calendarColor, partitionEvents } from "./today-schedule.helpers";
import { TodayTimeline } from "./today-timeline";

type TodayScheduleProps = {
  events: NormalizedEvent[];
};

/**
 * Connected-state interior of the Today card: today's schedule as a pinned
 * all-day band over a scrolling list of timed events, so the card reads as an
 * intentional schedule rather than a flat, truncated list.
 *
 * Height contract (parity with the Impact band, by construction): the card
 * stretches to the Impact band's height through the parent grid
 * (`grid-cols-2 items-stretch`), the section (`flex h-full flex-col`), and the
 * card frame (`flex-1 min-h-0 overflow-hidden` in calendar-connect-card.tsx).
 * This component sets NO fixed or capped height. The header and all-day band are
 * pinned; the timed list (`TodayTimeline`) is a `flex-1 min-h-0` scroll region.
 *
 * Split server/client: this server component renders the date line, the pinned
 * all-day band, and the partition; the timed list is a client island
 * (`TodayTimeline`) because its now-line, focus pill, and initial scroll depend
 * on the user's clock (a server render is UTC on Vercel, the same reason
 * `LocalDate` is an island). Per-calendar color is pure, so the all-day dots are
 * colored here and the timed node dots in the island, both keyed on calendarId.
 */
export function TodaySchedule({ events }: TodayScheduleProps) {
  const { allDay, timed } = partitionEvents(events);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Pinned header: the local date. Does not scroll. */}
      <div className="mb-3 flex items-center justify-end">
        <LocalDate
          variant="short"
          className="font-mono text-[11px] text-caption"
        />
      </div>

      {events.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Nothing on your calendar today.
        </p>
      ) : (
        <>
          {/* Pinned all-day band, separated from the timed list by a hairline.
              Omitted entirely when the day has no all-day events. The dot is
              colored by source calendar, matching the timed spine nodes. */}
          {allDay.length > 0 ? (
            <ul className="mb-3 shrink-0 border-b border-hairline pb-3">
              {allDay.map((event) => (
                <li
                  key={event.id}
                  className="flex items-center gap-2.5 py-0.5"
                >
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: calendarColor(event.calendarId) }}
                  />
                  <span className="truncate text-[13px] font-medium text-foreground">
                    {event.title}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {/* Timed events: client island (now-line, focus, scroll). */}
          {timed.length > 0 ? <TodayTimeline events={timed} /> : null}
        </>
      )}
    </div>
  );
}
