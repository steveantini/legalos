import { describe, expect, it } from "vitest";

import { segment, type Token } from "./segment";

/** Property: tokens partition [0, len) with no gaps/overlap and reconstruct the text. */
function assertLossless(text: string, tokens: Token[]): void {
  let cursor = 0;
  for (const t of tokens) {
    expect(t.start).toBe(cursor);
    expect(t.end).toBeGreaterThan(t.start);
    expect(t.value).toBe(text.slice(t.start, t.end));
    cursor = t.end;
  }
  expect(cursor).toBe(text.length);
  expect(tokens.map((t) => t.value).join("")).toBe(text);
}

describe("segment (word granularity)", () => {
  it("returns no tokens for the empty string", () => {
    expect(segment("")).toEqual([]);
  });

  it("tokenizes a single word with a full-span token", () => {
    expect(segment("hello")).toEqual([{ value: "hello", start: 0, end: 5 }]);
  });

  it("alternates word and whitespace tokens, losslessly", () => {
    const text = "Net 30 days";
    const tokens = segment(text);
    expect(tokens.map((t) => t.value)).toEqual(["Net", " ", "30", " ", "days"]);
    assertLossless(text, tokens);
  });

  it("treats newlines as whitespace (gap) tokens, losslessly", () => {
    const text = "a\nb\n\nc";
    const tokens = segment(text);
    expect(tokens.map((t) => t.value)).toEqual(["a", "\n", "b", "\n\n", "c"]);
    assertLossless(text, tokens);
  });

  it("is lossless across varied inputs", () => {
    for (const text of ["x", "  x  ", "one two  three", "a\tb", "\nlead", "trail\n"]) {
      assertLossless(text, segment(text));
    }
  });

  it("is deterministic (same input, identical output) and stateless across calls", () => {
    const text = "the quick brown fox";
    expect(segment(text)).toEqual(segment(text));
    // Re-running must not be affected by the module-level regex's lastIndex.
    segment("unrelated text here");
    expect(segment(text)).toEqual(segment(text));
  });
});
