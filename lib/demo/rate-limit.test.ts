import { describe, expect, it } from "vitest";

import { allowRequest, pruneWindow } from "./rate-limit";

describe("pruneWindow", () => {
  it("keeps only timestamps inside the window", () => {
    const now = 10_000;
    expect(pruneWindow([0, 5_000, 9_500], now, 1_000)).toEqual([9_500]);
  });
});

describe("allowRequest (sliding window)", () => {
  it("allows up to the limit, then blocks", () => {
    const limit = 3;
    const windowMs = 1_000;
    let stamps: number[] = [];

    for (let i = 0; i < limit; i++) {
      const r = allowRequest(stamps, 100 + i, limit, windowMs);
      expect(r.allowed).toBe(true);
      stamps = r.next;
    }

    const blocked = allowRequest(stamps, 200, limit, windowMs);
    expect(blocked.allowed).toBe(false);
    // A blocked hit is not recorded (count does not grow past the limit).
    expect(blocked.next.length).toBe(limit);
  });

  it("frees capacity once old hits fall out of the window", () => {
    const limit = 2;
    const windowMs = 1_000;
    const old = [0, 100];
    // At now=2000 both old hits are outside the 1s window → allowed again.
    const r = allowRequest(old, 2_000, limit, windowMs);
    expect(r.allowed).toBe(true);
    expect(r.next).toEqual([2_000]);
  });
});
