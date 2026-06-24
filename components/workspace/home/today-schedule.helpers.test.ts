import { describe, expect, it } from "vitest";

import type { NormalizedEvent } from "@/lib/workspace/home/calendar-connection";

import {
  formatAttendees,
  formatEventMeta,
  partitionEvents,
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

describe("formatEventMeta", () => {
  it("joins the attendee summary and conference label with a middot", () => {
    expect(
      formatEventMeta(
        event({ attendees: ["Sarah Chen"], conferenceLabel: "Google Meet" }),
      ),
    ).toBe("Sarah Chen · Google Meet");
  });

  it("drops the empty side rather than leaving a stray separator", () => {
    expect(
      formatEventMeta(event({ attendees: [], conferenceLabel: "Zoom" })),
    ).toBe("Zoom");
    expect(
      formatEventMeta(event({ attendees: ["Sarah Chen"], conferenceLabel: null })),
    ).toBe("Sarah Chen");
    expect(
      formatEventMeta(event({ attendees: [], conferenceLabel: null })),
    ).toBe("");
  });
});
