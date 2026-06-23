import { describe, expect, it } from "vitest";

import {
  FEED_TTL_MS,
  formatDuration,
  isFeedStale,
  relativeDate,
} from "./desk-feeds-shared";

describe("isFeedStale", () => {
  const now = Date.parse("2026-06-23T12:00:00.000Z");

  it("treats a never-fetched feed (null) as stale", () => {
    expect(isFeedStale(null, now)).toBe(true);
  });

  it("treats an unparseable timestamp as stale", () => {
    expect(isFeedStale("not-a-date", now)).toBe(true);
  });

  it("is fresh within the TTL and stale past it", () => {
    const justFetched = new Date(now - 60_000).toISOString(); // 1 min ago
    const longAgo = new Date(now - FEED_TTL_MS - 1).toISOString();
    expect(isFeedStale(justFetched, now)).toBe(false);
    expect(isFeedStale(longAgo, now)).toBe(true);
  });

  it("is stale exactly at the TTL boundary", () => {
    const atBoundary = new Date(now - FEED_TTL_MS).toISOString();
    expect(isFeedStale(atBoundary, now)).toBe(true);
  });
});

describe("relativeDate", () => {
  const now = Date.parse("2026-06-23T12:00:00.000Z");

  it("formats recent times relatively", () => {
    expect(relativeDate(new Date(now - 30_000).toISOString(), now)).toBe("just now");
    expect(relativeDate(new Date(now - 5 * 60_000).toISOString(), now)).toBe("5m ago");
    expect(relativeDate(new Date(now - 3 * 3600_000).toISOString(), now)).toBe("3h ago");
    expect(relativeDate(new Date(now - 2 * 86_400_000).toISOString(), now)).toBe("2d ago");
  });

  it("returns an empty string for null or invalid input", () => {
    expect(relativeDate(null, now)).toBe("");
    expect(relativeDate("garbage", now)).toBe("");
  });
});

describe("formatDuration", () => {
  it("formats with and without an hours component", () => {
    expect(formatDuration(750)).toBe("12:30");
    expect(formatDuration(3753)).toBe("1:02:33");
    expect(formatDuration(59)).toBe("0:59");
  });

  it("returns an empty string for null or non-positive input", () => {
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(0)).toBe("");
  });
});
