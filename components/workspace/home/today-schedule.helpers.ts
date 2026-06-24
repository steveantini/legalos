import type { NormalizedEvent } from "@/lib/workspace/home/calendar-connection";

/**
 * Pure view-logic for the Today card, split out so it is unit-testable in the
 * repo's node test environment (the components render JSX and a client island,
 * which the node runner does not execute). The components import these; the
 * rendering stays in `today-schedule.tsx` and `today-timeline.tsx`.
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
 * Human duration from whole minutes: "45 min" under an hour, "1 hr"/"2 hr" on
 * exact hours, "1 hr 30 min" otherwise. Empty string when the duration is
 * unknown or non-positive (all-day events, or a missing/zero end), so the
 * segment collapses.
 */
export function formatDuration(minutes: number | undefined): string {
  if (minutes === undefined || minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}

/**
 * Curated, muted palette tuned to the warm theme. Per-calendar color is keyed
 * on calendar identity against THIS palette, not the provider's own calendar
 * color (see DECISION_LOG D-175), so the surface stays coherent and on-brand
 * regardless of what color a user picked in Google. Dial-able; refine the
 * entries rather than sourcing color externally.
 */
export const CALENDAR_PALETTE = [
  "#5a6b9c", // slate
  "#b06a4a", // clay
  "#7c8a5f", // sage
  "#8a5a78", // plum
  "#4f8a86", // teal
  "#b08a4a", // ochre
  "#a86a78", // rose
  "#8a8276", // stone
] as const;

/**
 * A stable color for a calendar: a string hash of its id picks a palette entry,
 * so a calendar keeps the same color across days and renders (stateless). Two
 * calendars can collide on a color; that is rare and purely cosmetic.
 */
export function calendarColor(calendarId: string): string {
  let hash = 0;
  for (let i = 0; i < calendarId.length; i++) {
    hash = (hash * 31 + calendarId.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % CALENDAR_PALETTE.length;
  return CALENDAR_PALETTE[index];
}

/** A meta-line segment: which signal it is, and its display text. */
export type MetaSegmentKind = "location" | "duration" | "attendees" | "conference";
export type MetaSegment = { kind: MetaSegmentKind; text: string };

/**
 * The ordered, present-only segments of a timed event's meta line: location,
 * duration, attendee summary, conference label. Each appears only when it has
 * content, so the renderer never emits a stray separator. The component renders
 * each with its icon (and links the conference label / title when a URL is
 * present); `formatMetaLine` is the same composition as a plain string for
 * tests.
 */
export function buildMetaSegments(event: NormalizedEvent): MetaSegment[] {
  const segments: MetaSegment[] = [];
  if (event.location) segments.push({ kind: "location", text: event.location });
  const duration = formatDuration(event.durationMinutes);
  if (duration) segments.push({ kind: "duration", text: duration });
  const attendees = formatAttendees(event.attendees);
  if (attendees) segments.push({ kind: "attendees", text: attendees });
  if (event.conferenceLabel) {
    segments.push({ kind: "conference", text: event.conferenceLabel });
  }
  return segments;
}

/**
 * The meta line as a plain string: location and duration form the leading
 * logistics group (space-joined), then the attendee summary, then the
 * conference label, the three groups middot-joined with empty groups dropped.
 * Mirrors how the component renders, for unit testing the join.
 */
export function formatMetaLine(event: NormalizedEvent): string {
  const segments = buildMetaSegments(event);
  const logistics = segments
    .filter((s) => s.kind === "location" || s.kind === "duration")
    .map((s) => s.text)
    .join(" ");
  const attendees = segments.find((s) => s.kind === "attendees")?.text ?? "";
  const conference = segments.find((s) => s.kind === "conference")?.text ?? "";
  return [logistics, attendees, conference]
    .filter((part) => part.length > 0)
    .join(" · ");
}

/** The time-bounded subset of an event the now/next logic needs. */
export type TimedLike = Pick<NormalizedEvent, "startMs" | "endMs">;

/**
 * The event to emphasize: the in-progress event (`start <= now < end`, earliest
 * if several), else the earliest upcoming event (`start > now`), else null when
 * the whole timed day is past. `state` drives the pill copy ("Now" vs "Next").
 * Events are assumed start-sorted, so the first match in each pass is earliest.
 */
export function selectFocus(
  events: readonly TimedLike[],
  nowMs: number,
): { index: number; state: "now" | "next" } | null {
  for (let i = 0; i < events.length; i++) {
    const { startMs, endMs } = events[i];
    if (
      startMs !== undefined &&
      endMs !== undefined &&
      startMs <= nowMs &&
      nowMs < endMs
    ) {
      return { index: i, state: "now" };
    }
  }
  for (let i = 0; i < events.length; i++) {
    const { startMs } = events[i];
    if (startMs !== undefined && startMs > nowMs) {
      return { index: i, state: "next" };
    }
  }
  return null;
}

/**
 * Where to insert the now-line among start-sorted timed events: before the
 * first event that has not started (i.e. after all events with `start <= now`),
 * or 0 when now precedes them all. Returns null when the whole timed day is past
 * (now is at/after the last event's end, or its start when it has no end), so no
 * dangling line is drawn.
 */
export function nowLineIndex(
  events: readonly TimedLike[],
  nowMs: number,
): number | null {
  if (events.length === 0) return null;

  let started = 0;
  for (const { startMs } of events) {
    if (startMs !== undefined && startMs <= nowMs) started++;
  }
  if (started === 0) return 0; // now precedes every timed event

  const hasUpcoming = events.some(
    ({ startMs }) => startMs !== undefined && startMs > nowMs,
  );
  if (hasUpcoming) return started;

  // Every event has started: keep the line at the bottom only while the day is
  // still in progress; once now is past the last event, omit it.
  const last = events[events.length - 1];
  const lastBoundary = last.endMs ?? last.startMs;
  if (lastBoundary !== undefined && nowMs >= lastBoundary) return null;
  return events.length;
}
