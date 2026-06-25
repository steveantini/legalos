import type { Granularity } from "./contract";

/**
 * Stage 2 of the comparison pipeline: SEGMENT.
 *
 * Pure: `(normalizedText, granularity) -> Token[]`. Splits a normalized document
 * into the comparable units the diff aligns, each carrying an explicit span so
 * the engine never re-derives position downstream.
 *
 * The tokenization is LOSSLESS: tokens partition `[0, text.length)` with no gaps
 * and no overlap, so concatenating their values reconstructs the input exactly.
 * For WORD granularity this means alternating runs of non-whitespace (words) and
 * whitespace (gaps); after normalization a gap is a single space or one/two
 * newlines, so gaps almost always align and add no diff noise while keeping the
 * sequence lossless (a redline needs the inter-word whitespace to render).
 *
 * `granularity` is the extension point: only "word" is implemented in v1. The
 * parameter exists so sentence / line / character tokenizers can be added later
 * without changing callers; they are deliberately NOT built now.
 */

/** A comparable unit with its half-open span `[start, end)` into the text. */
export type Token = {
  readonly value: string;
  readonly start: number;
  readonly end: number;
};

/**
 * Greedy alternation: at each position match either a maximal whitespace run or
 * a maximal non-whitespace run. Because the two classes are complementary, the
 * global scan partitions the whole string with no gaps.
 */
const WORD_TOKENIZER = /\s+|\S+/g;

export function segment(
  text: string,
  granularity: Granularity = "word",
): Token[] {
  // Only "word" exists in the Granularity type today; the switch is the seam
  // future granularities slot into. Keeping it explicit documents the intent.
  switch (granularity) {
    case "word":
      return tokenizeWords(text);
    default:
      // Unreachable while Granularity === "word"; the exhaustiveness guard makes
      // adding a granularity a compile error here until it is implemented.
      return assertNever(granularity);
  }
}

function tokenizeWords(text: string): Token[] {
  const tokens: Token[] = [];
  if (text.length === 0) return tokens;
  // Fresh regex state per call (the module-level regex is stateful via /g).
  const re = new RegExp(WORD_TOKENIZER.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    tokens.push({
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return tokens;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled granularity: ${String(value)}`);
}
