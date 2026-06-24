import { LocalDate } from "@/components/workspace/local-date";
import type { NormalizedEvent } from "@/lib/workspace/home/calendar-connection";

import { formatEventMeta, partitionEvents } from "./today-schedule.helpers";

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
 * This component sets NO fixed or capped height; it fills whatever height the
 * row gives it. The header and all-day band are pinned; the timed list is a
 * `flex-1 min-h-0 overflow-y-auto` region that scrolls when the day overflows.
 * The `min-h-0` chain (here, the frame, and the scroll region) is what lets the
 * scroll region shrink below its content instead of pushing the row taller.
 *
 * The display date is the `<LocalDate>` client island (the user's browser
 * clock; a server render is UTC on Vercel and shows tomorrow during US
 * evenings). The card frame and the "Today" section heading live in the parent;
 * this fills the padded interior.
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
              Omitted entirely when the day has no all-day events. */}
          {allDay.length > 0 ? (
            <ul className="mb-3 shrink-0 border-b border-hairline pb-3">
              {allDay.map((event) => (
                <li
                  key={event.id}
                  className="flex items-center gap-2.5 py-0.5"
                >
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full bg-caption/60"
                  />
                  <span className="truncate text-[13px] font-medium text-foreground">
                    {event.title}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {/* Scroll region: the timed events. Fills the remaining height and
              scrolls on overflow, with a slim scrollbar and a soft edge fade. */}
          {timed.length > 0 ? (
            <ul className="scrollbar-slim scroll-fade-y min-h-0 flex-1 overflow-y-auto">
              {timed.map((event) => {
                const meta = formatEventMeta(event);
                return (
                  <li key={event.id} className="flex gap-3">
                    <span className="w-14 shrink-0 pt-3 text-right font-mono text-[12px] tabular-nums text-caption">
                      {event.startTime}
                    </span>
                    {/* Spine: a continuous hairline down the column with one
                        node dot per row sitting on it (ring punches the line). */}
                    <span
                      aria-hidden
                      className="relative w-[22px] shrink-0 self-stretch"
                    >
                      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-hairline" />
                      <span className="absolute left-1/2 top-[18px] size-1.5 -translate-x-1/2 rounded-full bg-caption/70 ring-2 ring-card" />
                    </span>
                    <div className="min-w-0 flex-1 py-3">
                      <p className="truncate text-[14px] font-medium text-foreground">
                        {event.title}
                      </p>
                      {meta ? (
                        <p className="truncate text-[12px] text-caption">
                          {meta}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}
