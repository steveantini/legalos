import "server-only";

import type { NormalizedEvent } from "@/lib/workspace/home/calendar-connection";

/**
 * Google Calendar read client (read-only): fetches the user's events for TODAY,
 * across ALL the calendars they keep visible, and normalizes them for the Today
 * card merged in start order. Mirrors the Drive content client's shape (typed
 * errors, no token material logged); the access token comes from the M5
 * capability gate + M6a token-exercise layer, exactly like Drive.
 *
 * WHY ALL VISIBLE CALENDARS, not just primary: people keep their real schedule
 * across several calendars (a personal one, a partner's, a kid's, a "social"),
 * and Google's day view shows all the ones they keep visible. A primary-only
 * read silently dropped everything else, including all-day events that lived on
 * a non-primary calendar. So we enumerate the user's calendar list, read each
 * VISIBLE (selected) calendar's day, and merge. This needs the
 * `calendar.calendarlist.readonly` scope on top of `calendar.events.readonly`
 * (the events scope alone cannot list calendars); both are read-only, so the
 * "never writes" promise holds. A token granted before that scope was added
 * 403s on the list call, which we surface as a distinct reconnect signal (see
 * `scope_insufficient`) rather than an empty card.
 *
 * THE TIMEZONE SUBTLETY: "today" must be bounded in the user's own timezone,
 * not the server's UTC, or an evening user sees tomorrow's events. We take the
 * user's zone from their primary calendar's `timeZone` (every calendarList
 * entry carries one) and compute ONE day window in that zone, applied to every
 * calendar and used to present every time, so the merged view is consistent
 * with what the user sees in Google. The window is RFC 3339 with the zone's UTC
 * offset (which the Calendar API accepts directly) and the day boundary is
 * computed per-day (each bound's offset taken at noon of its own day), so it
 * stays correct across a DST transition.
 *
 * Read-only throughout: this client only ever GETs.
 */

const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";
/** Per-calendar page size. A single calendar rarely has more than a handful today. */
const MAX_EVENTS_PER_CALENDAR = 12;
/** Cap on the merged, multi-calendar result; the card shows 3 + a "more" count. */
const MAX_TOTAL_EVENTS = 25;
/**
 * Calendar-list access roles whose events carry real detail (title, attendees).
 * A `freeBusyReader` calendar exposes only busy/free blocks, so its events would
 * render as contentless "(No title)" rows; we leave those calendars out.
 */
const READABLE_ACCESS_ROLES = new Set(["owner", "writer", "reader"]);

/**
 * Why a calendar read failed. Carries no token material. `scope_insufficient`
 * is distinct from `forbidden`: the token is valid but predates the
 * calendar-list scope, so the right response is a reconnect prompt, not a dead
 * empty card.
 */
export type CalendarReadErrorReason =
  | "forbidden"
  | "scope_insufficient"
  | "unreachable"
  | "bad_response";

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
  /**
   * Cross-calendar identity. The same invite copied onto two of the user's
   * calendars has a different `id` per copy but a shared `iCalUID`; we dedupe on
   * it so a merged view doesn't list the same meeting twice.
   */
  iCalUID?: string;
};

/** One entry from the user's calendar list (the fields the day read needs). */
export type RawCalendarListEntry = {
  id?: string;
  summary?: string;
  summaryOverride?: string;
  primary?: boolean;
  selected?: boolean;
  deleted?: boolean;
  timeZone?: string;
  accessRole?: string;
};

/** A calendar resolved as worth reading today, with its display + zone facts. */
export type CalendarRef = {
  id: string;
  summary: string;
  timeZone: string;
  primary: boolean;
};

async function calendarGet(
  url: string,
  accessToken: string,
  options: { scopeSensitive?: boolean } = {},
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      // A calendar's whole value is being CURRENT: it changes intraday, so an
      // event added to today's schedule must surface on the very next home
      // load, not after a cache window expires. Every read here (the calendar
      // list and each calendar's events) goes through this helper, so the
      // explicit no-store keeps Next from ever serving a stale Data Cache entry.
      // We don't lean on Next's implicit default staying no-store: freshness
      // this load-sensitive is stated by contract, not inherited.
      cache: "no-store",
    });
  } catch {
    throw new CalendarReadError("unreachable");
  }
  if (response.ok) return response;
  if (response.status === 403 && options.scopeSensitive) {
    // A 403 on the calendar-list call from an otherwise-valid token means the
    // token predates the `calendar.calendarlist.readonly` scope. Surface a
    // reconnect signal, distinct from a dead token, so the card prompts a
    // reconnect rather than showing an empty schedule.
    throw new CalendarReadError("scope_insufficient");
  }
  if (response.status === 401 || response.status === 403) {
    throw new CalendarReadError("forbidden");
  }
  throw new CalendarReadError("unreachable");
}

/**
 * Fetch and normalize today's events across ALL the user's visible calendars,
 * merged in start order. `now` is injected so the day window is deterministic
 * and testable.
 *
 * Throws {@link CalendarReadError} with reason `scope_insufficient` when the
 * token cannot list calendars (a pre-scope token), so the caller can prompt a
 * reconnect. A single calendar that fails to read is skipped, not fatal: one
 * unreadable calendar never empties the whole card.
 */
export async function fetchTodaysCalendarEvents(
  accessToken: string,
  now: Date,
): Promise<NormalizedEvent[]> {
  // 1. Enumerate the calendars worth reading (visible, readable, not deleted).
  const calendars = await listCalendarsToRead(accessToken);
  if (calendars.length === 0) return [];

  // 2. One day window, in the user's own zone, applied to every calendar so the
  //    merged view matches their Google day view and reads in one local zone.
  const userZone = resolveUserZone(calendars);
  const { timeMin, timeMax } = dayWindowInZone(now, userZone);

  // 3. Read every calendar's day in parallel; a per-calendar failure drops only
  //    that calendar (allSettled), so one bad calendar can't empty the card.
  const perCalendar = await Promise.allSettled(
    calendars.map((calendar) =>
      fetchCalendarDayEvents(calendar.id, accessToken, timeMin, timeMax),
    ),
  );
  const raws: RawCalendarEvent[] = [];
  for (const result of perCalendar) {
    if (result.status === "fulfilled") raws.push(...result.value);
  }

  // 4. Merge: order by start (all-day first), dedupe shared invites, normalize.
  return orderAndNormalize(raws, userZone);
}

/**
 * List the user's calendars and reduce to the ones worth reading today. The
 * 403-on-this-call path maps to `scope_insufficient` (a reconnect signal).
 */
async function listCalendarsToRead(accessToken: string): Promise<CalendarRef[]> {
  const response = await calendarGet(
    `${CALENDAR_BASE}/users/me/calendarList?fields=items(id,summary,summaryOverride,primary,selected,deleted,timeZone,accessRole)`,
    accessToken,
    { scopeSensitive: true },
  );
  let items: RawCalendarListEntry[];
  try {
    const json = (await response.json()) as { items?: RawCalendarListEntry[] };
    items = Array.isArray(json.items) ? json.items : [];
  } catch {
    throw new CalendarReadError("bad_response");
  }
  return pickCalendarsToRead(items);
}

/** Read one calendar's events for the given window; recurrences expanded. */
async function fetchCalendarDayEvents(
  calendarId: string,
  accessToken: string,
  timeMin: string,
  timeMax: string,
): Promise<RawCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    // singleEvents expands a recurring event into its concrete instances, so a
    // daily event shows today's instance; orderBy=startTime needs it set.
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(MAX_EVENTS_PER_CALENDAR),
  });
  const response = await calendarGet(
    `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    accessToken,
  );
  try {
    const json = (await response.json()) as { items?: RawCalendarEvent[] };
    return Array.isArray(json.items) ? json.items : [];
  } catch {
    throw new CalendarReadError("bad_response");
  }
}

/**
 * Reduce a raw calendar list to the calendars worth reading: visible to the
 * user (`selected`, or the primary, which is always shown), not deleted, and
 * readable in detail (not free/busy-only). Pure and unit-tested.
 */
export function pickCalendarsToRead(
  items: RawCalendarListEntry[],
): CalendarRef[] {
  return items
    .filter(
      (entry): entry is RawCalendarListEntry & { id: string } =>
        typeof entry.id === "string" &&
        entry.id.length > 0 &&
        entry.deleted !== true &&
        (entry.selected === true || entry.primary === true) &&
        (entry.accessRole === undefined ||
          READABLE_ACCESS_ROLES.has(entry.accessRole)),
    )
    .map((entry) => ({
      id: entry.id,
      summary: (entry.summaryOverride ?? entry.summary ?? "").trim(),
      timeZone: safeTimeZone(entry.timeZone),
      primary: entry.primary === true,
    }));
}

/**
 * The user's zone: their primary calendar's timezone, falling back to the first
 * calendar's, then UTC. One zone bounds "today" and presents every time, so the
 * merged multi-calendar view is internally consistent. Pure and unit-tested.
 */
export function resolveUserZone(refs: CalendarRef[]): string {
  const primary = refs.find((ref) => ref.primary);
  if (primary) return primary.timeZone;
  return refs[0]?.timeZone ?? "UTC";
}

/**
 * Order merged events by start, dedupe shared invites, normalize, and cap.
 * All-day events sort to the front of their day (their key is the day's start),
 * matching how a day view leads with them. Pure and unit-tested.
 */
export function orderAndNormalize(
  raws: RawCalendarEvent[],
  timeZone: string,
): NormalizedEvent[] {
  const ordered = raws
    .map((raw) => ({ raw, key: eventSortKey(raw, timeZone) }))
    .sort((a, b) => a.key - b.key);

  const out: NormalizedEvent[] = [];
  const seen = new Set<string>();
  for (const { raw } of ordered) {
    const normalized = normalizeCalendarEvent(raw, timeZone);
    if (!normalized) continue;
    const dedupeKey =
      typeof raw.iCalUID === "string" && raw.iCalUID.length > 0
        ? raw.iCalUID
        : normalized.id;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(normalized);
    if (out.length >= MAX_TOTAL_EVENTS) break;
  }
  return out;
}

/**
 * A sortable epoch-ms key for ordering a merged, cross-calendar day. Timed
 * events sort by their instant; an all-day event sorts at midnight of its date
 * in the user's zone, so it leads that day's timed events. Unparseable or
 * start-less events sort last (they are dropped in normalization anyway). Pure
 * and unit-tested.
 */
export function eventSortKey(raw: RawCalendarEvent, timeZone: string): number {
  if (raw.start?.dateTime) {
    const ms = Date.parse(raw.start.dateTime);
    return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
  }
  if (raw.start?.date) {
    // Anchor to midnight of the date in the user's zone. Noon-of-that-date is
    // used only to read the zone's offset (never inside a DST gap).
    const offset = zoneOffset(new Date(`${raw.start.date}T12:00:00Z`), timeZone);
    const ms = Date.parse(`${raw.start.date}T00:00:00${offset}`);
    return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
  }
  return Number.POSITIVE_INFINITY;
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
