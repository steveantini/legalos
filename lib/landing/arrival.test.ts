import { beforeEach, describe, expect, it } from "vitest";

import {
  isReturnVisit,
  markArrivalRendered,
  resetArrivalForTests,
} from "@/lib/landing/arrival";

describe("landing arrival flag", () => {
  beforeEach(() => {
    resetArrivalForTests();
  });

  it("starts cold (a fresh document has not rendered the landing)", () => {
    expect(isReturnVisit()).toBe(false);
  });

  it("reads as a return visit after the landing has rendered once", () => {
    markArrivalRendered();
    expect(isReturnVisit()).toBe(true);
  });

  it("is idempotent across repeated renders (e.g. StrictMode double effects)", () => {
    markArrivalRendered();
    markArrivalRendered();
    expect(isReturnVisit()).toBe(true);
  });

  it("resets to cold for the next test document", () => {
    markArrivalRendered();
    resetArrivalForTests();
    expect(isReturnVisit()).toBe(false);
  });
});
