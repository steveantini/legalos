import { describe, expect, it } from "vitest";

import { composeAgentTask } from "./agent-task";

describe("composeAgentTask", () => {
  it("returns the input unchanged when there is no instruction (pre-D3 behavior)", () => {
    expect(composeAgentTask(undefined, "the NDA text")).toBe("the NDA text");
  });

  it("returns the input unchanged when the instruction is blank", () => {
    expect(composeAgentTask("", "the NDA text")).toBe("the NDA text");
    expect(composeAgentTask("   \n ", "the NDA text")).toBe("the NDA text");
  });

  it("composes the instruction as the directive with the input delimited", () => {
    expect(
      composeAgentTask("Review this NDA and flag unusual terms", "the NDA text"),
    ).toBe(
      "Review this NDA and flag unusual terms\n\nInput:\n<step_input>\nthe NDA text\n</step_input>",
    );
  });

  it("trims the instruction but keeps the input verbatim", () => {
    expect(composeAgentTask("  Summarize this.  ", "  spaced  ")).toBe(
      "Summarize this.\n\nInput:\n<step_input>\n  spaced  \n</step_input>",
    );
  });

  it("returns the bare directive when the input is empty (no empty Input block)", () => {
    expect(composeAgentTask("Draft a standard NDA from scratch", "")).toBe(
      "Draft a standard NDA from scratch",
    );
    expect(composeAgentTask("Draft a standard NDA from scratch", "  \n")).toBe(
      "Draft a standard NDA from scratch",
    );
  });
});
