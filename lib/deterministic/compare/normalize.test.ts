import { describe, expect, it } from "vitest";

import { normalize } from "./normalize";

describe("normalize", () => {
  it("converts CRLF and CR line endings to LF", () => {
    expect(normalize("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("collapses runs of spaces and tabs within a line to a single space", () => {
    expect(normalize("a \t  b")).toBe("a b");
  });

  it("trims leading indentation and trailing whitespace per line", () => {
    expect(normalize("  a  \n\tb \n")).toBe("a\nb");
  });

  it("collapses three or more consecutive newlines to two", () => {
    expect(normalize("a\n\n\n\nb")).toBe("a\n\nb");
    expect(normalize("a\n\nb")).toBe("a\n\nb"); // a single blank line survives
  });

  it("trims the whole document", () => {
    expect(normalize("\n\n  hello  \n\n")).toBe("hello");
  });

  it("maps a whitespace-only document to the empty string", () => {
    expect(normalize("   \n\t \r\n  ")).toBe("");
  });

  it("maps the empty string to the empty string", () => {
    expect(normalize("")).toBe("");
  });

  it("is idempotent (normalizing twice equals normalizing once)", () => {
    const samples = [
      "The  quick\r\n brown   fox",
      "  indented \n\n\n paragraph  break ",
      "Net  30\tdays",
      "",
      "   ",
    ];
    for (const s of samples) {
      expect(normalize(normalize(s))).toBe(normalize(s));
    }
  });

  it("preserves word boundaries (does not merge tokens)", () => {
    expect(normalize("Net30")).toBe("Net30");
    expect(normalize("Net 30")).toBe("Net 30");
  });
});
