import { describe, expect, it } from "vitest";

import { evaluateAgentEditLock, isFullyLockedSource } from "./lock";

const NATIVE = null;
const C4L = "claude-for-legal:commercial-legal/nda";
const SYSTEM = "builtin:tools/contract-summarizer";

const fields = (over: Partial<Parameters<typeof evaluateAgentEditLock>[1]> = {}) => ({
  name: "Agent",
  description: "Does a thing.",
  systemPrompt: "You are helpful.",
  webSearch: false,
  ...over,
});

describe("isFullyLockedSource", () => {
  it("is true for the built-in tier, false for C4L and native", () => {
    expect(isFullyLockedSource(SYSTEM)).toBe(true);
    expect(isFullyLockedSource(C4L)).toBe(false);
    expect(isFullyLockedSource(NATIVE)).toBe(false);
  });
  it("holds even for the malformed (no-slash) builtin:tools form", () => {
    expect(isFullyLockedSource("builtin:tools")).toBe(true);
  });
});

describe("evaluateAgentEditLock", () => {
  it("allows any edit to a native (unsourced) agent", () => {
    expect(
      evaluateAgentEditLock(NATIVE, fields(), fields({ name: "Renamed" })),
    ).toEqual({ ok: true });
  });

  it("rejects ANY submit for a fully-locked built-in agent (model included)", () => {
    // Even with every managed field identical, the system tier is not editable.
    const res = evaluateAgentEditLock(SYSTEM, fields(), fields());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.formError).toMatch(/legalOS/);
  });

  it("for C4L, allows model/output edits (those fields aren't compared)", () => {
    // The lock only compares name/description/system prompt/web search; a model
    // change carries no managed-field diff, so the edit is allowed.
    expect(evaluateAgentEditLock(C4L, fields(), fields())).toEqual({ ok: true });
  });

  it("for C4L, rejects a managed-field change and names the source", () => {
    const res = evaluateAgentEditLock(C4L, fields(), fields({ name: "Renamed" }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.formError).toMatch(/Claude for Legal/);
      expect(res.formError).toMatch(/name/);
    }
  });

  it("for C4L, rejects a web-search toggle change", () => {
    const res = evaluateAgentEditLock(C4L, fields(), fields({ webSearch: true }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.formError).toMatch(/web search/);
  });
});
