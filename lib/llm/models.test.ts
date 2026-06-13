import { describe, expect, it } from "vitest";

import {
  COMPOSER_MODEL_IDS,
  DEFAULT_MODEL_FALLBACK,
  MODEL_BY_ID,
  SELECTABLE_MODEL_IDS,
  isSelectableModel,
  isSupportedModel,
} from "./models";
import { computeCostMicroUsd } from "./pricing";

/**
 * Guards the load-bearing composition of the canonical models source: which
 * models may be newly selected, which is the code default, and that retained
 * but unselectable models keep their pricing. The default reverted to Opus 4.8
 * when Fable 5 became unavailable (a government-driven halt, D-164); Fable 5 is
 * deliberately RETAINED as a selectable choice so its return is a one-line
 * default change. A regression that dropped Fable 5 from the set, or flipped the
 * default off a selectable model, would fail here rather than silently ship.
 */
describe("canonical models source", () => {
  const FABLE = "anthropic/claude-fable-5";
  const OPUS_48 = "anthropic/claude-opus-4-8";
  const SONNET = "anthropic/claude-sonnet-4-6";
  const HAIKU = "anthropic/claude-haiku-4-5-20251001";

  it("offers exactly the four current models for new selection, in canonical order", () => {
    expect(SELECTABLE_MODEL_IDS).toEqual([FABLE, OPUS_48, SONNET, HAIKU]);
  });

  it("surfaces the same four in the composer quick-pick", () => {
    expect(COMPOSER_MODEL_IDS).toEqual([FABLE, OPUS_48, SONNET, HAIKU]);
  });

  it("defaults new agents to Opus 4.8, which is itself selectable", () => {
    expect(DEFAULT_MODEL_FALLBACK).toBe(OPUS_48);
    expect(isSelectableModel(DEFAULT_MODEL_FALLBACK)).toBe(true);
  });

  it("retains Fable 5 as a fully present, selectable, priced choice", () => {
    expect(isSupportedModel(FABLE)).toBe(true);
    expect(isSelectableModel(FABLE)).toBe(true);
    expect(MODEL_BY_ID[FABLE]?.pricing.inputPerMillion).toBe(10);
  });

  it("retains the older Opus generations as known but unselectable, with pricing", () => {
    for (const id of [
      "anthropic/claude-opus-4-7",
      "anthropic/claude-opus-4-6",
    ]) {
      expect(isSupportedModel(id)).toBe(true);
      expect(isSelectableModel(id)).toBe(false);
      expect(MODEL_BY_ID[id]?.pricing.inputPerMillion).toBe(5);
    }
  });

  it("computes Opus 4.8 cost correctly from its retained pricing", () => {
    // $5 / million input, $25 / million output → micro-USD = tokens * perMillion.
    expect(computeCostMicroUsd(1_000, 0, 0, 0, 0, OPUS_48)).toBe(5_000);
    expect(computeCostMicroUsd(0, 1_000, 0, 0, 0, OPUS_48)).toBe(25_000);
  });
});
