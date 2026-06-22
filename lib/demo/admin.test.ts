import { describe, expect, it } from "vitest";

import {
  computeDemoExpiry,
  DEMO_DEFAULT_WINDOW_DAYS,
  DEMO_LABEL_MAX_LENGTH,
  demoLinkDisplayStatus,
  normalizeDemoLabel,
  resolveDemoWindowDays,
} from "./admin";

describe("resolveDemoWindowDays (allowlist, default 14)", () => {
  it("accepts the offered windows", () => {
    expect(resolveDemoWindowDays(7)).toBe(7);
    expect(resolveDemoWindowDays(14)).toBe(14);
    expect(resolveDemoWindowDays(30)).toBe(30);
  });

  it("accepts a numeric string (form value)", () => {
    expect(resolveDemoWindowDays("30")).toBe(30);
  });

  it("falls back to 14 for anything off the allowlist or junk", () => {
    expect(resolveDemoWindowDays(3)).toBe(DEMO_DEFAULT_WINDOW_DAYS);
    expect(resolveDemoWindowDays(9999)).toBe(DEMO_DEFAULT_WINDOW_DAYS);
    expect(resolveDemoWindowDays("abc")).toBe(DEMO_DEFAULT_WINDOW_DAYS);
    expect(resolveDemoWindowDays(null)).toBe(DEMO_DEFAULT_WINDOW_DAYS);
    expect(resolveDemoWindowDays(undefined)).toBe(DEMO_DEFAULT_WINDOW_DAYS);
  });
});

describe("computeDemoExpiry", () => {
  it("returns now + N days as ISO", () => {
    const now = Date.parse("2026-06-22T00:00:00.000Z");
    expect(computeDemoExpiry(now, 14)).toBe("2026-07-06T00:00:00.000Z");
    expect(computeDemoExpiry(now, 7)).toBe("2026-06-29T00:00:00.000Z");
  });
});

describe("normalizeDemoLabel", () => {
  it("trims and keeps a real label", () => {
    expect(normalizeDemoLabel("  Acme Corp – GC  ")).toBe("Acme Corp – GC");
  });

  it("collapses empty / whitespace / non-strings to null", () => {
    expect(normalizeDemoLabel("")).toBeNull();
    expect(normalizeDemoLabel("   ")).toBeNull();
    expect(normalizeDemoLabel(42)).toBeNull();
    expect(normalizeDemoLabel(null)).toBeNull();
  });

  it("caps length", () => {
    const long = "x".repeat(DEMO_LABEL_MAX_LENGTH + 50);
    expect(normalizeDemoLabel(long)).toHaveLength(DEMO_LABEL_MAX_LENGTH);
  });
});

describe("demoLinkDisplayStatus (derived, not stored)", () => {
  const now = Date.parse("2026-06-22T12:00:00.000Z");
  const future = new Date(now + 60_000).toISOString();
  const passed = new Date(now - 60_000).toISOString();

  it("revoked wins over the clock", () => {
    expect(
      demoLinkDisplayStatus({ status: "revoked", expires_at: future }, now),
    ).toBe("revoked");
    expect(
      demoLinkDisplayStatus({ status: "revoked", expires_at: passed }, now),
    ).toBe("revoked");
  });

  it("active while not revoked and now < expires_at", () => {
    expect(
      demoLinkDisplayStatus({ status: "active", expires_at: future }, now),
    ).toBe("active");
  });

  it("expired once the clock passes expires_at", () => {
    expect(
      demoLinkDisplayStatus({ status: "active", expires_at: passed }, now),
    ).toBe("expired");
  });
});
