import { describe, expect, it } from "vitest";

import {
  DOCUMENT_COMPARE_PRE_STEP,
  hasDocumentComparePreStep,
  parseAgentCapabilities,
  rebuildToolsEnabled,
} from "./capabilities";

describe("parseAgentCapabilities", () => {
  it("routes a model tool to modelTools and never to preSteps", () => {
    const caps = parseAgentCapabilities(["web_search"]);
    expect(caps.modelTools).toEqual(["web_search"]);
    expect(caps.preSteps).toEqual([]);
  });

  it("routes a namespaced pre-step to preSteps and never to modelTools", () => {
    const caps = parseAgentCapabilities([DOCUMENT_COMPARE_PRE_STEP]);
    expect(caps.preSteps).toEqual([DOCUMENT_COMPARE_PRE_STEP]);
    expect(caps.modelTools).toEqual([]);
  });

  it("keeps the two capability kinds distinct when both are present", () => {
    const caps = parseAgentCapabilities([
      "web_search",
      DOCUMENT_COMPARE_PRE_STEP,
    ]);
    expect(caps.modelTools).toEqual(["web_search"]);
    expect(caps.preSteps).toEqual([DOCUMENT_COMPARE_PRE_STEP]);
  });

  it("drops an unknown prestep:* token from BOTH lists (forward-compatible)", () => {
    const caps = parseAgentCapabilities([
      "web_search",
      "prestep:knowledge_search",
    ]);
    expect(caps.modelTools).toEqual(["web_search"]);
    expect(caps.preSteps).toEqual([]);
  });

  it("dedupes repeated pre-step ids", () => {
    const caps = parseAgentCapabilities([
      DOCUMENT_COMPARE_PRE_STEP,
      DOCUMENT_COMPARE_PRE_STEP,
    ]);
    expect(caps.preSteps).toEqual([DOCUMENT_COMPARE_PRE_STEP]);
  });

  it("tolerates the column's unknown shape (null, non-array, non-strings)", () => {
    expect(parseAgentCapabilities(null)).toEqual({
      modelTools: [],
      preSteps: [],
    });
    expect(parseAgentCapabilities("web_search")).toEqual({
      modelTools: [],
      preSteps: [],
    });
    expect(parseAgentCapabilities([1, true, null, "web_search"])).toEqual({
      modelTools: ["web_search"],
      preSteps: [],
    });
  });
});

describe("hasDocumentComparePreStep", () => {
  it("is true only when the document-compare pre-step is declared", () => {
    expect(hasDocumentComparePreStep([DOCUMENT_COMPARE_PRE_STEP])).toBe(true);
    expect(hasDocumentComparePreStep(["web_search", DOCUMENT_COMPARE_PRE_STEP])).toBe(
      true,
    );
  });

  it("is false for an ordinary agent (no pre-step) and a model-tool-only agent", () => {
    expect(hasDocumentComparePreStep([])).toBe(false);
    expect(hasDocumentComparePreStep(["web_search"])).toBe(false);
    expect(hasDocumentComparePreStep(null)).toBe(false);
  });

  it("is not fooled by a model tool that merely resembles the namespace", () => {
    // A model tool literally named "web_search" must never count as a pre-step.
    expect(hasDocumentComparePreStep(["web_search"])).toBe(false);
    // An unknown prestep:* token is not the document-compare pre-step.
    expect(hasDocumentComparePreStep(["prestep:something_else"])).toBe(false);
  });
});

describe("rebuildToolsEnabled", () => {
  it("rebuilds the model-tool portion from the form while preserving pre-steps", () => {
    // Editing a Document Comparison fork: toggling web search on/off must never
    // drop the deterministic pre-step the form does not render.
    expect(
      rebuildToolsEnabled([DOCUMENT_COMPARE_PRE_STEP], { webSearch: false }),
    ).toEqual([DOCUMENT_COMPARE_PRE_STEP]);
    expect(
      rebuildToolsEnabled([DOCUMENT_COMPARE_PRE_STEP], { webSearch: true }),
    ).toEqual(["web_search", DOCUMENT_COMPARE_PRE_STEP]);
    expect(
      rebuildToolsEnabled(["web_search", DOCUMENT_COMPARE_PRE_STEP], {
        webSearch: false,
      }),
    ).toEqual([DOCUMENT_COMPARE_PRE_STEP]);
  });

  it("preserves the pre-step partition GENERICALLY, including a future unrecognized one", () => {
    // A pre-step token this build does NOT know about (not in PRE_STEP_IDS) must
    // still survive a form edit: preservation keys on the namespace, not the
    // known-id partition, so a newer pre-step on an older deploy is never wiped.
    const future = "prestep:knowledge_search";
    expect(
      rebuildToolsEnabled([DOCUMENT_COMPARE_PRE_STEP, future], {
        webSearch: false,
      }),
    ).toEqual([DOCUMENT_COMPARE_PRE_STEP, future]);
    expect(
      rebuildToolsEnabled(["web_search", future], { webSearch: true }),
    ).toEqual(["web_search", future]);
    // Dropping web search keeps the unrecognized pre-step untouched.
    expect(
      rebuildToolsEnabled(["web_search", future], { webSearch: false }),
    ).toEqual([future]);
  });

  it("leaves an ordinary agent (no pre-step) controlled entirely by the form", () => {
    expect(rebuildToolsEnabled([], { webSearch: false })).toEqual([]);
    expect(rebuildToolsEnabled([], { webSearch: true })).toEqual(["web_search"]);
    expect(rebuildToolsEnabled(["web_search"], { webSearch: false })).toEqual([]);
    // Tolerant of the column's unknown shape.
    expect(rebuildToolsEnabled(null, { webSearch: true })).toEqual(["web_search"]);
  });
});
