/**
 * Stage 1 of the comparison pipeline: NORMALIZE.
 *
 * Pure: `string -> string`. Applies diff-oriented canonicalization so that
 * differences that are pure FORMATTING (line-ending style, indentation,
 * runs of spaces/tabs, excess blank lines) do not surface as material changes,
 * while preserving the word and paragraph structure the change set needs.
 *
 * It does NOT re-extract: the `lib/extract` layer already turned PDF/DOCX/etc.
 * into plain text and stripped styling. This stage only canonicalizes
 * whitespace on top of that.
 *
 * Deliberate v1 policy (documented so it can be revisited): HORIZONTAL
 * whitespace amount (spaces, tabs, indentation) and excess blank lines are
 * treated as non-material and collapsed, so documents differing only in those
 * compare as unchanged. NEWLINE STRUCTURE is preserved: a line break vs a space,
 * or a paragraph break, is a real difference (this discards the least
 * information). Word boundaries are preserved, so "Net30" vs "Net 30" differs.
 * The trade-off (PDF line-rewrap can surface as a change) is acceptable for v1
 * and isolated to this stage if a future policy wants to neutralize it.
 */

/**
 * Canonicalize a plain-text document for word-level diffing:
 *   1. Line endings: CRLF / CR -> LF.
 *   2. Per line: collapse runs of whitespace to a single space, and trim the
 *      line (drops indentation and trailing whitespace, both formatting).
 *   3. Collapse three or more consecutive newlines to two (at most one blank
 *      line between paragraphs), preserving paragraph structure.
 *   4. Trim the whole document.
 */
export function normalize(raw: string): string {
  const unixEndings = raw.replace(/\r\n?/g, "\n");

  const perLine = unixEndings
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n");

  const collapsedBlankLines = perLine.replace(/\n{3,}/g, "\n\n");

  return collapsedBlankLines.trim();
}
