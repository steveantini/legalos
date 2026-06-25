import type {
  ComparisonDocument,
  ComparisonResult,
  Granularity,
} from "./contract";
import { diffTokens } from "./diff";
import { emit } from "./emit";
import { normalize } from "./normalize";
import { segment } from "./segment";

/**
 * Document comparison — the first DETERMINISTIC OPERATION (D-185). See
 * `lib/deterministic/README.md` for the operation contract this conforms to.
 *
 * Pure: same inputs always produce a byte-identical `ComparisonResult`. No I/O,
 * no clock, no randomness, no model, no hidden state. It composes the four
 * independently-tested pure stages:
 *
 *   normalize -> segment -> diff (align) -> emit
 *
 * Inputs are already-extracted plain text (from `lib/extract`); this engine does
 * not parse files or call a model. The result is a structured change set rich
 * enough to render a visual redline AND to hand a model as authoritative input.
 */
export function compareDocuments(
  oldDocument: ComparisonDocument,
  newDocument: ComparisonDocument,
  options?: { granularity?: Granularity },
): ComparisonResult {
  const granularity: Granularity = options?.granularity ?? "word";

  const normalizedOld = normalize(oldDocument.text);
  const normalizedNew = normalize(newDocument.text);

  const oldTokens = segment(normalizedOld, granularity);
  const newTokens = segment(normalizedNew, granularity);

  const ops = diffTokens(oldTokens, newTokens);

  return emit(ops, normalizedOld, normalizedNew, granularity, {
    old: oldDocument.truncated ?? false,
    new: newDocument.truncated ?? false,
  });
}
