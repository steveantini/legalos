import { describe, expect, it } from "vitest";

import {
  dayWindowInZone,
  formatTimeInZone,
  normalizeCalendarEvent,
  type RawCalendarEvent,
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
    expect(normalizeCalendarEvent(raw, tz)).toEqual({
      id: "evt1",
      title: "Deal review",
      startTime: "10:00",
      endTime: "11:00",
      attendees: ["Sarah Chen", "james@example.com"], // resource room excluded
      conferenceLabel: "Google Meet",
    });
  });

  it("labels an all-day event and gives it no end time", () => {
    const raw: RawCalendarEvent = {
      id: "evt2",
      summary: "Team offsite",
      start: { date: "2026-06-23" },
      end: { date: "2026-06-24" },
    };
    const result = normalizeCalendarEvent(raw, tz);
    expect(result?.startTime).toBe("All day");
    expect(result?.endTime).toBeUndefined();
    expect(result?.title).toBe("Team offsite");
  });

  it("falls back to a placeholder title and infers Meet from hangoutLink", () => {
    const raw: RawCalendarEvent = {
      id: "evt3",
      start: { dateTime: "2026-06-23T13:00:00Z" },
      hangoutLink: "https://meet.google.com/abc",
    };
    const result = normalizeCalendarEvent(raw, tz);
    expect(result?.title).toBe("(No title)");
    expect(result?.conferenceLabel).toBe("Google Meet");
    expect(result?.attendees).toEqual([]);
  });

  it("drops cancelled events and events with no id or start", () => {
    expect(
      normalizeCalendarEvent(
        { id: "x", status: "cancelled", start: { dateTime: "2026-06-23T13:00:00Z" } },
        tz,
      ),
    ).toBeNull();
    expect(normalizeCalendarEvent({ summary: "no id", start: { date: "2026-06-23" } }, tz)).toBeNull();
    expect(normalizeCalendarEvent({ id: "no-start" }, tz)).toBeNull();
  });

  it("has no conference label for an in-person event", () => {
    const raw: RawCalendarEvent = {
      id: "evt4",
      summary: "Coffee",
      start: { dateTime: "2026-06-23T13:00:00Z" },
    };
    expect(normalizeCalendarEvent(raw, tz)?.conferenceLabel).toBeNull();
  });
});
