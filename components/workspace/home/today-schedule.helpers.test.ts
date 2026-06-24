import { describe, expect, it } from "vitest";

import type { NormalizedEvent } from "@/lib/workspace/home/calendar-connection";

import {
  buildMetaSegments,
  calendarColor,
  CALENDAR_PALETTE,
  formatAttendees,
  formatDuration,
  formatMetaLine,
  nowLineIndex,
  partitionEvents,
  selectFocus,
  type TimedLike,
} from "./today-schedule.helpers";

/** A NormalizedEvent with sensible defaults, overridable per case. */
function event(over: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    id: "evt",
    title: "Meeting",
    startTime: "10:00",
    attendees: [],
    conferenceLabel: null,
    calendarId: "cal",
    calendarName: "Calendar",
    isAllDay: false,
    ...over,
  };
}

describe("partitionEvents", () => {
  it("splits all-day events from timed events, preserving order", () => {
    const events = [
      event({ id: "t1", startTime: "09:00" }),
      event({ id: "ad1", startTime: "All day" }),
      event({ id: "t2", startTime: "16:00" }),
      event({ id: "ad2", startTime: "All day" }),
    ];
    const { allDay, timed } = partitionEvents(events);
    expect(allDay.map((e) => e.id)).toEqual(["ad1", "ad2"]);
    expect(timed.map((e) => e.id)).toEqual(["t1", "t2"]);
  });

  it("returns empty groups for an empty day", () => {
    expect(partitionEvents([])).toEqual({ allDay: [], timed: [] });
  });

  it("puts every event in the timed group when none are all-day", () => {
    const events = [event({ id: "a" }), event({ id: "b", startTime: "11:30" })];
    const { allDay, timed } = partitionEvents(events);
    expect(allDay).toHaveLength(0);
    expect(timed).toHaveLength(2);
  });
});

describe("formatAttendees", () => {
  it("shows the first two names then +N for the rest", () => {
    expect(formatAttendees(["Sarah Chen", "James Park", "Amy", "Leo"])).toBe(
      "Sarah Chen, James Park +2",
    );
    expect(formatAttendees(["Sarah Chen", "James Park"])).toBe(
      "Sarah Chen, James Park",
    );
    expect(formatAttendees([])).toBe("");
  });
});

describe("formatDuration", () => {
  it("formats minutes, exact hours, and mixed", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 hr");
    expect(formatDuration(120)).toBe("2 hr");
    expect(formatDuration(90)).toBe("1 hr 30 min");
  });

  it("omits a missing or non-positive duration", () => {
    expect(formatDuration(undefined)).toBe("");
    expect(formatDuration(0)).toBe("");
    expect(formatDuration(-10)).toBe("");
  });
});

describe("calendarColor", () => {
  it("is deterministic and stable for a given id", () => {
    expect(calendarColor("amy@example.com")).toBe(calendarColor("amy@example.com"));
  });

  it("always returns a palette entry", () => {
    for (const id of ["a", "primary@me", "leo", "social", "x".repeat(40)]) {
      expect(CALENDAR_PALETTE).toContain(calendarColor(id));
    }
  });
});

describe("buildMetaSegments / formatMetaLine", () => {
  it("orders present segments: location, duration, attendees, conference", () => {
    const segments = buildMetaSegments(
      event({
        location: "Cafe Mox",
        durationMinutes: 60,
        attendees: ["Sarah Chen", "James Park"],
        conferenceLabel: "Zoom",
      }),
    );
    expect(segments.map((s) => s.kind)).toEqual([
      "location",
      "duration",
      "attendees",
      "conference",
    ]);
    expect(formatMetaLine(event({
      location: "Cafe Mox",
      durationMinutes: 60,
      attendees: ["Sarah Chen", "James Park"],
      conferenceLabel: "Zoom",
    }))).toBe("Cafe Mox 1 hr · Sarah Chen, James Park · Zoom");
  });

  it("drops absent segments without stray separators", () => {
    expect(formatMetaLine(event({ durationMinutes: 30 }))).toBe("30 min");
    expect(formatMetaLine(event({ location: "Room 4" }))).toBe("Room 4");
    expect(formatMetaLine(event({ conferenceLabel: "Google Meet" }))).toBe(
      "Google Meet",
    );
    expect(
      formatMetaLine(event({ location: "Room 4", conferenceLabel: "Google Meet" })),
    ).toBe("Room 4 · Google Meet");
    expect(
      formatMetaLine(event({ attendees: ["Amy"], conferenceLabel: "Zoom" })),
    ).toBe("Amy · Zoom");
    expect(formatMetaLine(event({}))).toBe("");
  });
});

describe("selectFocus", () => {
  // 09:00-10:00, 11:00-12:00, 14:00-15:00 (epoch-ish minutes as ms for clarity).
  const events: TimedLike[] = [
    { startMs: 900, endMs: 1000 },
    { startMs: 1100, endMs: 1200 },
    { startMs: 1400, endMs: 1500 },
  ];

  it("focuses the in-progress event as Now", () => {
    expect(selectFocus(events, 1150)).toEqual({ index: 1, state: "now" });
  });

  it("focuses the earliest upcoming event as Next when none is in progress", () => {
    expect(selectFocus(events, 1050)).toEqual({ index: 1, state: "next" });
    expect(selectFocus(events, 0)).toEqual({ index: 0, state: "next" });
  });

  it("returns null when the whole day is past", () => {
    expect(selectFocus(events, 2000)).toBeNull();
  });
});

describe("nowLineIndex", () => {
  const events: TimedLike[] = [
    { startMs: 900, endMs: 1000 },
    { startMs: 1100, endMs: 1200 },
    { startMs: 1400, endMs: 1500 },
  ];

  it("places the line at the top when now precedes all events", () => {
    expect(nowLineIndex(events, 100)).toBe(0);
  });

  it("places the line at the boundary between started and upcoming events", () => {
    expect(nowLineIndex(events, 1050)).toBe(1); // first started, two upcoming
    expect(nowLineIndex(events, 1250)).toBe(2); // two started, one upcoming
  });

  it("keeps the line at the bottom while the last event is still in progress", () => {
    expect(nowLineIndex(events, 1450)).toBe(3);
  });

  it("omits the line once the whole day is past", () => {
    expect(nowLineIndex(events, 2000)).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(nowLineIndex([], 100)).toBeNull();
  });
});
