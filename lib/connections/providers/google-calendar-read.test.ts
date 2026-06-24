import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CalendarReadError,
  dayWindowInZone,
  eventSortKey,
  fetchTodaysCalendarEvents,
  formatTimeInZone,
  normalizeCalendarEvent,
  orderAndNormalize,
  pickCalendarsToRead,
  resolveUserZone,
  type CalendarRef,
  type RawCalendarEvent,
  type RawCalendarListEntry,
  type SourcedEvent,
} from "./google-calendar-read";

describe("dayWindowInZone", () => {
  it("bounds today in the calendar's zone, not UTC (evening user stays on today)", () => {
    // 18:00 UTC is still the 23rd in New York and already the 24th in Tokyo.
    const now = new Date("2026-06-23T18:00:00Z");
    expect(dayWindowInZone(now, "America/New_York")).toEqual({
      timeMin: "2026-06-23T00:00:00-04:00",
      timeMax: "2026-06-24T00:00:00-04:00",
    });
    expect(dayWindowInZone(now, "Asia/Tokyo")).toEqual({
      timeMin: "2026-06-24T00:00:00+09:00",
      timeMax: "2026-06-25T00:00:00+09:00",
    });
    expect(dayWindowInZone(now, "UTC")).toEqual({
      timeMin: "2026-06-23T00:00:00+00:00",
      timeMax: "2026-06-24T00:00:00+00:00",
    });
  });

  it("uses the zone's seasonal offset (DST aware)", () => {
    // New York is -04:00 in summer (EDT) and -05:00 in winter (EST).
    const summer = dayWindowInZone(new Date("2026-06-23T18:00:00Z"), "America/New_York");
    const winter = dayWindowInZone(new Date("2026-01-15T18:00:00Z"), "America/New_York");
    expect(summer.timeMin).toBe("2026-06-23T00:00:00-04:00");
    expect(winter.timeMin).toBe("2026-01-15T00:00:00-05:00");
  });

  it("handles half-hour offset zones", () => {
    const now = new Date("2026-06-23T18:00:00Z"); // 23:30 IST
    expect(dayWindowInZone(now, "Asia/Kolkata")).toEqual({
      timeMin: "2026-06-23T00:00:00+05:30",
      timeMax: "2026-06-24T00:00:00+05:30",
    });
  });
});

describe("formatTimeInZone", () => {
  it("formats an instant as 24-hour HH:mm in the zone", () => {
    // 14:30 UTC is 10:30 in New York (EDT).
    expect(formatTimeInZone("2026-06-23T14:30:00Z", "America/New_York")).toBe("10:30");
    expect(formatTimeInZone("2026-06-23T14:30:00Z", "UTC")).toBe("14:30");
  });

  it("returns empty string for an unparseable instant", () => {
    expect(formatTimeInZone("not-a-date", "UTC")).toBe("");
  });
});

describe("normalizeCalendarEvent", () => {
  const tz = "America/New_York";
  const cal: CalendarRef = {
    id: "cal-work",
    summary: "Work",
    timeZone: tz,
    primary: true,
  };

  it("normalizes a timed event with attendees and a conference label", () => {
    const raw: RawCalendarEvent = {
      id: "evt1",
      status: "confirmed",
      summary: "Deal review",
      start: { dateTime: "2026-06-23T14:00:00Z" },
      end: { dateTime: "2026-06-23T15:00:00Z" },
      attendees: [
        { displayName: "Sarah Chen" },
        { email: "james@example.com" },
        { displayName: "Room A", resource: true },
      ],
      conferenceData: { conferenceSolution: { name: "Google Meet" } },
    };
    expect(normalizeCalendarEvent(raw, tz, cal)).toEqual({
      id: "evt1",
      title: "Deal review",
      startTime: "10:00",
      endTime: "11:00",
      attendees: ["Sarah Chen", "james@example.com"], // resource room excluded
      conferenceLabel: "Google Meet",
      calendarId: "cal-work",
      calendarName: "Work",
      isAllDay: false,
      startMs: Date.parse("2026-06-23T14:00:00Z"),
      endMs: Date.parse("2026-06-23T15:00:00Z"),
      durationMinutes: 60,
      // location, joinUrl, htmlLink are undefined here and omitted by toEqual.
    });
  });

  it("labels an all-day event and leaves it no times or duration", () => {
    const raw: RawCalendarEvent = {
      id: "evt2",
      summary: "Team offsite",
      start: { date: "2026-06-23" },
      end: { date: "2026-06-24" },
    };
    const result = normalizeCalendarEvent(raw, tz, cal);
    expect(result?.startTime).toBe("All day");
    expect(result?.endTime).toBeUndefined();
    expect(result?.title).toBe("Team offsite");
    expect(result?.isAllDay).toBe(true);
    expect(result?.startMs).toBeUndefined();
    expect(result?.endMs).toBeUndefined();
    expect(result?.durationMinutes).toBeUndefined();
  });

  it("computes duration in minutes and omits it when the end is missing", () => {
    const ninetyMin = normalizeCalendarEvent(
      {
        id: "d1",
        summary: "Workshop",
        start: { dateTime: "2026-06-23T14:00:00Z" },
        end: { dateTime: "2026-06-23T15:30:00Z" },
      },
      tz,
      cal,
    );
    expect(ninetyMin?.durationMinutes).toBe(90);

    const noEnd = normalizeCalendarEvent(
      { id: "d2", summary: "Open ended", start: { dateTime: "2026-06-23T14:00:00Z" } },
      tz,
      cal,
    );
    expect(noEnd?.startMs).toBe(Date.parse("2026-06-23T14:00:00Z"));
    expect(noEnd?.endMs).toBeUndefined();
    expect(noEnd?.durationMinutes).toBeUndefined();
  });

  it("retains a trimmed location, an open-in-Google link, and the source calendar", () => {
    const raw: RawCalendarEvent = {
      id: "evt-loc",
      summary: "Lunch",
      start: { dateTime: "2026-06-23T16:00:00Z" },
      end: { dateTime: "2026-06-23T17:00:00Z" },
      location: "  Cafe Mox, 2nd floor  ",
      htmlLink: "https://calendar.google.com/event?eid=abc",
    };
    const source: CalendarRef = {
      id: "amy-cal",
      summary: "Amy",
      timeZone: tz,
      primary: false,
    };
    const result = normalizeCalendarEvent(raw, tz, source);
    expect(result?.location).toBe("Cafe Mox, 2nd floor");
    expect(result?.htmlLink).toBe("https://calendar.google.com/event?eid=abc");
    expect(result?.calendarId).toBe("amy-cal");
    expect(result?.calendarName).toBe("Amy");
  });

  it("omits an empty location", () => {
    const result = normalizeCalendarEvent(
      {
        id: "evt-noloc",
        summary: "Call",
        start: { dateTime: "2026-06-23T16:00:00Z" },
        location: "   ",
      },
      tz,
      cal,
    );
    expect(result?.location).toBeUndefined();
  });

  it("prefers the video entry point for joinUrl, then falls back to hangoutLink", () => {
    const withEntryPoint = normalizeCalendarEvent(
      {
        id: "evt-join1",
        summary: "Sync",
        start: { dateTime: "2026-06-23T16:00:00Z" },
        hangoutLink: "https://meet.google.com/legacy",
        conferenceData: {
          conferenceSolution: { name: "Zoom" },
          entryPoints: [
            { entryPointType: "phone", uri: "tel:+15551234" },
            { entryPointType: "video", uri: "https://zoom.us/j/123" },
          ],
        },
      },
      tz,
      cal,
    );
    expect(withEntryPoint?.joinUrl).toBe("https://zoom.us/j/123");

    const hangoutOnly = normalizeCalendarEvent(
      {
        id: "evt-join2",
        summary: "Sync",
        start: { dateTime: "2026-06-23T16:00:00Z" },
        hangoutLink: "https://meet.google.com/abc",
      },
      tz,
      cal,
    );
    expect(hangoutOnly?.joinUrl).toBe("https://meet.google.com/abc");

    const inPerson = normalizeCalendarEvent(
      { id: "evt-join3", summary: "Coffee", start: { dateTime: "2026-06-23T16:00:00Z" } },
      tz,
      cal,
    );
    expect(inPerson?.joinUrl).toBeUndefined();
  });

  it("falls back to a placeholder title and infers Meet from hangoutLink", () => {
    const raw: RawCalendarEvent = {
      id: "evt3",
      start: { dateTime: "2026-06-23T13:00:00Z" },
      hangoutLink: "https://meet.google.com/abc",
    };
    const result = normalizeCalendarEvent(raw, tz, cal);
    expect(result?.title).toBe("(No title)");
    expect(result?.conferenceLabel).toBe("Google Meet");
    expect(result?.attendees).toEqual([]);
  });

  it("drops cancelled events and events with no id or start", () => {
    expect(
      normalizeCalendarEvent(
        { id: "x", status: "cancelled", start: { dateTime: "2026-06-23T13:00:00Z" } },
        tz,
        cal,
      ),
    ).toBeNull();
    expect(
      normalizeCalendarEvent({ summary: "no id", start: { date: "2026-06-23" } }, tz, cal),
    ).toBeNull();
    expect(normalizeCalendarEvent({ id: "no-start" }, tz, cal)).toBeNull();
  });

  it("has no conference label for an in-person event", () => {
    const raw: RawCalendarEvent = {
      id: "evt4",
      summary: "Coffee",
      start: { dateTime: "2026-06-23T13:00:00Z" },
    };
    expect(normalizeCalendarEvent(raw, tz, cal)?.conferenceLabel).toBeNull();
  });
});

describe("pickCalendarsToRead", () => {
  it("keeps visible (selected) and primary calendars, drops the rest", () => {
    const items: RawCalendarListEntry[] = [
      { id: "primary@me", summary: "Steven Antini", primary: true, timeZone: "America/New_York" },
      { id: "amy", summary: "Amy", selected: true, timeZone: "America/New_York" },
      { id: "hidden", summary: "Hidden", selected: false }, // not visible
      { id: "no-flag", summary: "No flag" }, // selected omitted (defaults false)
    ];
    expect(pickCalendarsToRead(items).map((c) => c.id)).toEqual(["primary@me", "amy"]);
  });

  it("includes the primary even if it is not flagged selected", () => {
    const items: RawCalendarListEntry[] = [
      { id: "primary@me", summary: "Me", primary: true },
    ];
    expect(pickCalendarsToRead(items).map((c) => c.id)).toEqual(["primary@me"]);
  });

  it("drops deleted, free/busy-only, and id-less entries", () => {
    const items: RawCalendarListEntry[] = [
      { id: "deleted", selected: true, deleted: true },
      { id: "freebusy", selected: true, accessRole: "freeBusyReader" },
      { summary: "no id", selected: true },
      { id: "ok", selected: true, accessRole: "reader" },
    ];
    expect(pickCalendarsToRead(items).map((c) => c.id)).toEqual(["ok"]);
  });

  it("prefers summaryOverride and falls back to a safe timezone", () => {
    const [ref] = pickCalendarsToRead([
      { id: "leo", summary: "Leo", summaryOverride: "Leo (school)", selected: true, timeZone: "Not/AZone" },
    ]);
    expect(ref.summary).toBe("Leo (school)");
    expect(ref.timeZone).toBe("UTC"); // unparseable zone falls back
  });
});

describe("resolveUserZone", () => {
  const ref = (over: Partial<CalendarRef>): CalendarRef => ({
    id: "x",
    summary: "X",
    timeZone: "UTC",
    primary: false,
    ...over,
  });

  it("uses the primary calendar's zone", () => {
    expect(
      resolveUserZone([
        ref({ id: "a", timeZone: "Asia/Tokyo" }),
        ref({ id: "p", timeZone: "America/New_York", primary: true }),
      ]),
    ).toBe("America/New_York");
  });

  it("falls back to the first calendar's zone, then UTC", () => {
    expect(resolveUserZone([ref({ timeZone: "Asia/Kolkata" })])).toBe("Asia/Kolkata");
    expect(resolveUserZone([])).toBe("UTC");
  });
});

describe("eventSortKey", () => {
  const tz = "America/New_York";

  it("orders an all-day event before that day's timed events", () => {
    const allDay = eventSortKey({ id: "a", start: { date: "2026-06-23" } }, tz);
    const earlyTimed = eventSortKey(
      { id: "b", start: { dateTime: "2026-06-23T00:30:00-04:00" } },
      tz,
    );
    expect(allDay).toBeLessThan(earlyTimed);
  });

  it("orders timed events by their instant", () => {
    const nine = eventSortKey({ id: "a", start: { dateTime: "2026-06-23T09:00:00-04:00" } }, tz);
    const ten = eventSortKey({ id: "b", start: { dateTime: "2026-06-23T10:00:00-04:00" } }, tz);
    expect(nine).toBeLessThan(ten);
  });

  it("sorts start-less or unparseable events last", () => {
    expect(eventSortKey({ id: "a" }, tz)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("orderAndNormalize", () => {
  const tz = "America/New_York";
  const cal = (id: string): CalendarRef => ({
    id,
    summary: id,
    timeZone: tz,
    primary: id === "primary",
  });
  /** Wrap raws as same-calendar SourcedEvents for the ordering cases. */
  const onOneCalendar = (raws: RawCalendarEvent[]): SourcedEvent[] =>
    raws.map((raw) => ({ raw, calendar: cal("primary") }));

  it("merges calendars in start order with all-day events first", () => {
    const sourced = onOneCalendar([
      { id: "t2", summary: "Late", start: { dateTime: "2026-06-23T16:00:00-04:00" } },
      { id: "ad", summary: "Test 1", start: { date: "2026-06-23" } },
      { id: "t1", summary: "Early", start: { dateTime: "2026-06-23T09:00:00-04:00" } },
    ]);
    expect(orderAndNormalize(sourced, tz).map((e) => e.title)).toEqual([
      "Test 1",
      "Early",
      "Late",
    ]);
  });

  it("dedupes a shared invite by iCalUID, keeping the first-sorted copy's calendar", () => {
    // Same invite on two calendars; both sort to the same instant, so the first
    // in input order survives and its source calendar is the one carried.
    const sourced: SourcedEvent[] = [
      {
        raw: { id: "copy-a", iCalUID: "shared@google.com", summary: "Family dinner", start: { dateTime: "2026-06-23T18:00:00-04:00" } },
        calendar: cal("amy"),
      },
      {
        raw: { id: "copy-b", iCalUID: "shared@google.com", summary: "Family dinner", start: { dateTime: "2026-06-23T18:00:00-04:00" } },
        calendar: cal("leo"),
      },
    ];
    const result = orderAndNormalize(sourced, tz);
    expect(result).toHaveLength(1);
    expect(result[0].calendarId).toBe("amy");
  });
});

describe("fetchTodaysCalendarEvents (multi-calendar orchestration)", () => {
  const now = new Date("2026-06-23T18:00:00Z");

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Route a mocked fetch by URL: calendar list, then per-calendar events. */
  function mockCalendarApi(
    list: RawCalendarListEntry[],
    eventsByCalendarId: Record<string, { ok: boolean; items?: RawCalendarEvent[] }>,
  ): void {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/users/me/calendarList")) {
        return { ok: true, status: 200, json: async () => ({ items: list }) } as Response;
      }
      const match = /\/calendars\/([^/]+)\/events/.exec(url);
      const calendarId = match ? decodeURIComponent(match[1]) : "";
      const entry = eventsByCalendarId[calendarId];
      if (!entry || !entry.ok) {
        return { ok: false, status: 500, json: async () => ({}) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ items: entry.items ?? [] }) } as Response;
    });
  }

  it("merges events from every visible calendar, time-sorted", async () => {
    mockCalendarApi(
      [
        { id: "primary@me", primary: true, timeZone: "America/New_York" },
        { id: "amy", selected: true, timeZone: "America/New_York" },
      ],
      {
        "primary@me": {
          ok: true,
          items: [
            { id: "ad", summary: "Test 1", start: { date: "2026-06-23" } },
            { id: "p2", summary: "Standup", start: { dateTime: "2026-06-23T09:30:00-04:00" } },
          ],
        },
        amy: {
          ok: true,
          items: [{ id: "a1", summary: "Amy pickup", start: { dateTime: "2026-06-23T09:00:00-04:00" } }],
        },
      },
    );

    const events = await fetchTodaysCalendarEvents("token", now);
    expect(events.map((e) => e.title)).toEqual(["Test 1", "Amy pickup", "Standup"]);
  });

  it("skips a calendar that fails to read without emptying the card", async () => {
    mockCalendarApi(
      [
        { id: "primary@me", primary: true, timeZone: "America/New_York" },
        { id: "broken", selected: true, timeZone: "America/New_York" },
      ],
      {
        "primary@me": {
          ok: true,
          items: [{ id: "p1", summary: "Deal review", start: { dateTime: "2026-06-23T10:00:00-04:00" } }],
        },
        broken: { ok: false },
      },
    );

    const events = await fetchTodaysCalendarEvents("token", now);
    expect(events.map((e) => e.title)).toEqual(["Deal review"]);
  });

  it("surfaces a calendar-list 403 as scope_insufficient (reconnect signal)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/users/me/calendarList")) {
        return { ok: false, status: 403, json: async () => ({}) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ items: [] }) } as Response;
    });

    await expect(fetchTodaysCalendarEvents("token", now)).rejects.toMatchObject({
      reason: "scope_insufficient",
    });
    await expect(fetchTodaysCalendarEvents("token", now)).rejects.toBeInstanceOf(
      CalendarReadError,
    );
  });
});
