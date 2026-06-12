import { describe, expect, it } from "vitest";

import {
  createSupportRateLimiter,
  SUPPORT_GLOBAL_MESSAGES_PER_DAY,
  SUPPORT_MESSAGES_PER_MINUTE,
} from "@/lib/support/rate-limit";

const T0 = Date.UTC(2026, 5, 12, 12, 0, 0);

describe("support rate limiter", () => {
  it("allows the per-minute budget, then blocks the same caller", () => {
    let now = T0;
    const limiter = createSupportRateLimiter(() => now);
    for (let i = 0; i < SUPPORT_MESSAGES_PER_MINUTE; i++) {
      expect(limiter.check("caller-a")).toBe("ok");
      now += 1_000;
    }
    expect(limiter.check("caller-a")).toBe("rate_limited");
    // A different caller is unaffected.
    expect(limiter.check("caller-b")).toBe("ok");
  });

  it("frees the caller again once the window slides past", () => {
    let now = T0;
    const limiter = createSupportRateLimiter(() => now);
    for (let i = 0; i < SUPPORT_MESSAGES_PER_MINUTE; i++) {
      expect(limiter.check("caller-a")).toBe("ok");
    }
    expect(limiter.check("caller-a")).toBe("rate_limited");
    now += 61_000;
    expect(limiter.check("caller-a")).toBe("ok");
  });

  it("rests globally once the daily budget is spent, for every caller", () => {
    let now = T0;
    const limiter = createSupportRateLimiter(() => now);
    for (let i = 0; i < SUPPORT_GLOBAL_MESSAGES_PER_DAY; i++) {
      // Spread across callers and time so no per-minute limit interferes.
      expect(limiter.check(`caller-${i}`)).toBe("ok");
      now += 10;
    }
    expect(limiter.check("caller-fresh")).toBe("resting");
  });

  it("wakes up on the next UTC day", () => {
    let now = T0;
    const limiter = createSupportRateLimiter(() => now);
    for (let i = 0; i < SUPPORT_GLOBAL_MESSAGES_PER_DAY; i++) {
      limiter.check(`caller-${i}`);
      now += 10;
    }
    expect(limiter.check("caller-fresh")).toBe("resting");
    now = T0 + 24 * 60 * 60 * 1_000;
    expect(limiter.check("caller-fresh")).toBe("ok");
  });
});
