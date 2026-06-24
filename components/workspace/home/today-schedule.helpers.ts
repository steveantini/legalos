import type { NormalizedEvent } from "@/lib/workspace/home/calendar-connection";

/**
 * Pure view-logic for the Today card, split out so it is unit-testable in the
 * repo's node test environment (the component itself renders JSX and a client
 * island, which the node runner does not execute). The component imports these;
 * the rendering stays in `today-schedule.tsx`.
 */

/**
 * The sentinel `startTime` the calendar normalizer assigns to an all-day event
 * (`normalizeCalendarEvent` in google-calendar-read.ts). All-day events carry
 * no clock time, so they are pinned in their own band rather than the timed
 * scroll list. Kept as a local constant to avoid importing the server-only read
 * client here; the two must agree on this literal.
 */
export const ALL_DAY_LABEL = "All day";

/**
 * Split the day into all-day events (pinned band) and timed events (scroll
 * region), preserving the input order within each group.
 */
export function partitionEvents(events: NormalizedEvent[]): {
  allDay: NormalizedEvent[];
  timed: NormalizedEvent[];
} {
  const allDay: NormalizedEvent[] = [];
  const timed: NormalizedEvent[] = [];
  for (const event of events) {
    (event.startTime === ALL_DAY_LABEL ? allDay : timed).push(event);
  }
  return { allDay, timed };
}

/**
 * Attendee summary line: first two names, then "+N" for the rest, e.g.
 * "Sarah Chen, James Park +2". Empty string when there are no attendees, so
 * the line collapses rather than rendering a stray separator.
 */
export function formatAttendees(attendees: string[]): string {
  if (attendees.length === 0) return "";
  const shown = attendees.slice(0, 2);
  const extra = attendees.length - shown.length;
  return extra > 0 ? `${shown.join(", ")} +${extra}` : shown.join(", ");
}

/**
 * The meta sub-line under a timed event's title: the attendee summary and the
 * conference label, middot-joined, with empty parts dropped so a missing piece
 * never leaves a stray separator. Returns "" when there is nothing to show.
 */
export function formatEventMeta(event: NormalizedEvent): string {
  return [formatAttendees(event.attendees), event.conferenceLabel ?? ""]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(" · ");
}
