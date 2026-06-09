import { describe, expect, it } from "vitest";

import { formatMetric } from "./format";

/**
 * Locks the metric-layer format tokens (analytics arc, Step 1). These run on raw
 * values straight from the service-role views, so the cases cover the number /
 * string / null union a Postgres cell can yield, plus the micro-USD → dollars
 * transform and the recency phrasing.
 */

describe("formatMetric", () => {
  it("text passes strings through and shows an em-dash-free dash for null", () => {
    expect(formatMetric("Acme Legal", "text")).toBe("Acme Legal");
    expect(formatMetric(null, "text")).toBe("—");
    expect(formatMetric(5, "text")).toBe("5");
  });

  it("int rounds and groups; null -> dash", () => {
    expect(formatMetric(1234, "int")).toBe("1,234");
    expect(formatMetric(1234.6, "int")).toBe("1,235");
    expect(formatMetric(null, "int")).toBe("—");
  });

  it("compact abbreviates above a thousand, exact below", () => {
    expect(formatMetric(999, "compact")).toBe("999");
    expect(formatMetric(1000, "compact")).toBe("1k");
    expect(formatMetric(1500, "compact")).toBe("1.5k");
    expect(formatMetric(2_400_000, "compact")).toBe("2.4m");
  });

  it("percent renders a 0..1 ratio with up to one decimal", () => {
    expect(formatMetric(0, "percent")).toBe("0%");
    expect(formatMetric(0.5, "percent")).toBe("50%");
    expect(formatMetric(0.6667, "percent")).toBe("66.7%");
    expect(formatMetric(1, "percent")).toBe("100%");
  });

  it("usd / usd4 convert micro-USD to dollars", () => {
    expect(formatMetric(0, "usd")).toBe("$0.00");
    expect(formatMetric(1_234_560_000, "usd")).toBe("$1,234.56");
    expect(formatMetric(12_300, "usd4")).toBe("$0.0123");
  });

  it("duration formats milliseconds", () => {
    expect(formatMetric(500, "duration")).toBe("0.5s");
    expect(formatMetric(2300, "duration")).toBe("2.3s");
    expect(formatMetric(64000, "duration")).toBe(`1m${" "}4s`);
  });

  it("relative-time gives calm recency; null -> dash", () => {
    expect(formatMetric(null, "relative-time")).toBe("—");
    expect(formatMetric(new Date().toISOString(), "relative-time")).toBe("today");

    const threeDaysAgo = new Date(
      Date.now() - (3 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
    ).toISOString();
    expect(formatMetric(threeDaysAgo, "relative-time")).toBe("3d ago");

    const yesterday = new Date(
      Date.now() - (24 * 60 * 60 * 1000 + 60 * 60 * 1000),
    ).toISOString();
    expect(formatMetric(yesterday, "relative-time")).toBe("yesterday");
  });
});
