import "server-only";

import type { NormalizedEvent } from "@/lib/workspace/home/calendar-connection";

/**
 * Google Calendar read client (read-only): fetches the user's events for TODAY
 * and normalizes them for the Today card. Mirrors the Drive content client's
 * shape (typed errors, no token material logged); the access token comes from
 * the M5 capability gate + M6a token-exercise layer, exactly like Drive.
 *
 * THE TIMEZONE SUBTLETY: "today" must be bounded in the user's calendar
 * timezone, not the server's UTC, or an evening user sees tomorrow's events.
 * We read the primary calendar's own `timeZone` and compute the day window in
 * that zone (RFC 3339 with the zone's UTC offset, which the Calendar API
 * accepts directly), so the window is correct regardless of where the server
 * runs. The day boundary is computed per-day (each bound's offset taken at noon
 * of its own day), so it stays correct across a DST transition.
 *
 * Scope is `calendar.events.readonly`: this client only ever GETs.
 */

const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";
/** A day rarely has more than a handful of meetings; the card shows 3 + a count. */
const MAX_EVENTS = 12;

/** Why a calendar read failed. Carries no token material. */
export type CalendarReadErrorReason = "forbidden" | "unreachable" | "bad_response";

export class CalendarReadError extends Error {
  constructor(readonly reason: CalendarReadErrorReason) {
    super(reason);
    this.name = "CalendarReadError";
  }
}

/** The subset of a Google Calendar event the Today card uses. */
export type RawCalendarEvent = {
  id?: string;
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ displayName?: string; email?: string; resource?: boolean }>;
  hangoutLink?: string;
  conferenceData?: { conferenceSolution?: { name?: string } };
};

async function calendarGet(url: string, accessToken: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      // A calendar's whole value is being CURRENT: it changes intraday, so an
      // event added to today's schedule must surface on the very next home
      // load, not after a cache window expires. Both reads here (the primary
      // calendar's timezone and today's events) go through this helper, so the
      // explicit no-store keeps Next from ever serving a stale Data Cache entry
      // for either. We don't lean on Next's implicit default staying no-store:
      // freshness this load-sensitive is stated by contract, not inherited.
      cache: "no-store",
    });
  } catch {
    throw new CalendarReadError("unreachable");
  }
  if (response.ok) return response;
  if (response.status === 401 || response.status === 403) {
    throw new CalendarReadError("forbidden");
  }
  throw new CalendarReadError("unreachable");
}

/**
 * Fetch and normalize today's events from the user's primary calendar. `now` is
 * injected so the day window is deterministic and testable. Returns events in
 * start order (all-day events first, as the Calendar API orders them).
 */
export async function fetchTodaysCalendarEvents(
  accessToken: string,
  now: Date,
): Promise<NormalizedEvent[]> {
  // 1. The primary calendar's own timezone, so "today" is the user's today.
  const calResponse = await calendarGet(
    `${CALENDAR_BASE}/calendars/primary?fields=timeZone`,
    accessToken,
  );
  let timeZone: string;
  try {
    const calJson = (await calResponse.json()) as { timeZone?: string };
    timeZone = safeTimeZone(calJson.timeZone);
  } catch {
    throw new CalendarReadError("bad_response");
  }

  // 2. Today's window in that zone.
  const { timeMin, timeMax } = dayWindowInZone(now, timeZone);
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(MAX_EVENTS),
  });

  // 3. The events, normalized.
  const eventsResponse = await calendarGet(
    `${CALENDAR_BASE}/calendars/primary/events?${params.toString()}`,
    accessToken,
  );
  let items: RawCalendarEvent[];
  try {
    const json = (await eventsResponse.json()) as { items?: RawCalendarEvent[] };
    items = Array.isArray(json.items) ? json.items : [];
  } catch {
    throw new CalendarReadError("bad_response");
  }

  return items
    .map((event) => normalizeCalendarEvent(event, timeZone))
    .filter((event): event is NormalizedEvent => event !== null);
}

/**
 * Normalize one Google Calendar event into the card's NormalizedEvent, or null
 * when it should be dropped (cancelled, or no id/start). Pure and unit-tested.
 * All-day events (a `start.date` with no `dateTime`) render with an "All day"
 * label; a missing title falls back to "(No title)".
 */
export function normalizeCalendarEvent(
  raw: RawCalendarEvent,
  timeZone: string,
): NormalizedEvent | null {
  if (!raw || raw.status === "cancelled") return null;
  if (typeof raw.id !== "string" || raw.id.length === 0) return null;

  const title =
    typeof raw.summary === "string" && raw.summary.trim().length > 0
      ? raw.summary.trim()
      : "(No title)";

  let startTime: string;
  let endTime: string | undefined;
  if (raw.start?.dateTime) {
    startTime = formatTimeInZone(raw.start.dateTime, timeZone);
    endTime = raw.end?.dateTime
      ? formatTimeInZone(raw.end.dateTime, timeZone)
      : undefined;
  } else if (raw.start?.date) {
    startTime = "All day";
  } else {
    return null;
  }

  const attendees = Array.isArray(raw.attendees)
    ? raw.attendees
        .filter((a) => !a.resource)
        .map((a) => (a.displayName ?? a.email ?? "").trim())
        .filter((name) => name.length > 0)
    : [];

  const conferenceLabel =
    raw.conferenceData?.conferenceSolution?.name ??
    (raw.hangoutLink ? "Google Meet" : null);

  return { id: raw.id, title, startTime, endTime, attendees, conferenceLabel };
}

/** Format an ISO instant as "HH:mm" in the given zone (24-hour). "" if invalid. */
export function formatTimeInZone(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/**
 * Today's [timeMin, timeMax) window in `timeZone`, as RFC 3339 strings carrying
 * the zone's UTC offset (the Calendar API accepts these directly). `now` is
 * passed in for determinism. Each bound's offset is read at noon of its own day,
 * so a DST transition between today and tomorrow doesn't skew the window. Pure
 * and unit-tested.
 */
export function dayWindowInZone(
  now: Date,
  timeZone: string,
): { timeMin: string; timeMax: string } {
  const today = zoneDateParts(now, timeZone);
  // Noon today is unambiguous (never inside a DST gap); use its offset for the
  // day's bound so the spring-forward/fall-back days don't skew the window.
  const noonToday = new Date(
    `${today.y}-${today.m}-${today.d}T12:00:00${zoneOffset(now, timeZone)}`,
  );
  const todayOffset = zoneOffset(noonToday, timeZone);
  const timeMin = `${today.y}-${today.m}-${today.d}T00:00:00${todayOffset}`;

  const tomorrowInstant = new Date(noonToday.getTime() + 24 * 60 * 60 * 1000);
  const tomorrow = zoneDateParts(tomorrowInstant, timeZone);
  const tomorrowOffset = zoneOffset(tomorrowInstant, timeZone);
  const timeMax = `${tomorrow.y}-${tomorrow.m}-${tomorrow.d}T00:00:00${tomorrowOffset}`;

  return { timeMin, timeMax };
}

/** Year/month/day of `date` as seen in `timeZone`, zero-padded. */
function zoneDateParts(
  date: Date,
  timeZone: string,
): { y: string; m: string; d: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** The zone's UTC offset at `date` as "+HH:MM" / "-HH:MM" (UTC → "+00:00"). */
function zoneOffset(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d{2}):?(\d{2})/.exec(name);
  if (!match) return "+00:00";
  return `${match[1]}${match[2]}:${match[3]}`;
}

/** A valid IANA zone, or "UTC" when the provider returns nothing usable. */
function safeTimeZone(timeZone: string | undefined): string {
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}
