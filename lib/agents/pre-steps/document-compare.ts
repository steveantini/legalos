/**
 * Document-comparison deterministic PRE-STEP — the consumer side of the comparison
 * engine (lib/deterministic/compare), and the FIRST instance of the deterministic
 * pre-step pattern (see lib/agents/capabilities.ts and DECISION_LOG).
 *
 * A deterministic pre-step runs UNCONDITIONALLY, in code, BEFORE the model call,
 * and produces a structured result the model receives as AUTHORITATIVE input. Here
 * that flow is:
 *
 *   resolved doc texts  ->  compareDocuments()  ->  serializeComparison()  ->  the
 *   authoritative change-set block the model explains (and cannot alter).
 *
 * This module is a CONSUMER of the change-set contract — like the future redline
 * renderer, it lives on the agent/run side and imports the pure engine. The engine
 * never imports this; lib/deterministic/compare stays pure and consumer-agnostic.
 * Everything here is itself deterministic (no I/O, no clock, no randomness) and is
 * unit-tested.
 *
 * INTERIM ordering convention (until commit 4's role-aware two-input UI): the FIRST
 * document is the ORIGINAL (older) and the SECOND is the REVISED (newer). The
 * model-facing block LABELS which is which, so the model's prose is correct
 * regardless of how the documents arrive. Commit 4 replaces this positional
 * convention with explicit roles.
 */

import {
  compareDocuments,
  type ComparisonResult,
} from "@/lib/deterministic/compare";

/**
 * One document handed to the pre-step: a human label (its filename) plus
 * already-extracted, normalized text (lib/extract output — NEVER re-extracted
 * here). `truncated` is the caller's honest signal that this document hit the
 * extraction cap; it is surfaced verbatim in the serialized block.
 */
export type PreStepDocument = {
  readonly label: string;
  readonly text: string;
  readonly truncated?: boolean;
};

/**
 * The pre-step's outcome. Either the run is READY (the authoritative change-set
 * block is built and ready to inject as the model's input) or a GUARD fired (the
 * pre-step cannot run; the user gets a clear, friendly message and NO model turn).
 */
export type DocumentComparePreStepOutcome =
  | { readonly status: "ready"; readonly authoritativeBlock: string }
  | { readonly status: "guard"; readonly message: string };

/**
 * Words of unchanged text shown on each side of a change for context. Bounded so
 * a large document does not dump its full equal text into the block, while still
 * giving the model enough to locate each change. Word-based and deterministic.
 */
export const COMPARISON_CONTEXT_WORDS = 6;

/** Guard copy is USER-FACING — kept free of em dashes per the copy convention. */
function wrongCountMessage(count: number): string {
  if (count === 0) {
    return "This agent compares two documents and needs both to begin. Attach exactly two files, the original version first and the revised version second, then send your message again.";
  }
  if (count === 1) {
    return "This agent compares two documents, but only one was attached. Attach the original version first and the revised version second, then send your message again.";
  }
  return `This agent compares exactly two documents, but ${count} were attached. Attach just two files, the original version first and the revised version second, then send your message again.`;
}

const EMPTY_DOCUMENT_MESSAGE =
  "One of the attached documents has no readable text, so there is nothing to compare. Attach two documents that contain text, the original version first and the revised version second, then try again.";

function words(text: string): string[] {
  return text.trim().split(/\s+/).filter((w) => w.length > 0);
}

/** Last `n` words of `text`, prefixed with an ellipsis when more were dropped. */
function tailContext(text: string, n: number): string {
  const w = words(text);
  if (w.length === 0) return "";
  if (w.length <= n) return w.join(" ");
  return `...${w.slice(-n).join(" ")}`;
}

/** First `n` words of `text`, suffixed with an ellipsis when more were dropped. */
function headContext(text: string, n: number): string {
  const w = words(text);
  if (w.length === 0) return "";
  if (w.length <= n) return w.join(" ");
  return `${w.slice(0, n).join(" ")}...`;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function truncationNote(truncated: ComparisonResult["truncated"]): string | null {
  if (truncated.old && truncated.new) {
    return "Note: both documents exceeded the extraction limit and were truncated, so this comparison covers only the first portion of each. It may be partial.";
  }
  if (truncated.old) {
    return "Note: the original document exceeded the extraction limit and was truncated, so this comparison covers only its first portion. It may be partial.";
  }
  if (truncated.new) {
    return "Note: the revised document exceeded the extraction limit and was truncated, so this comparison covers only its first portion. It may be partial.";
  }
  return null;
}

export type SerializeComparisonOptions = {
  readonly originalLabel: string;
  readonly revisedLabel: string;
  /** Context words per side around each change. Defaults to COMPARISON_CONTEXT_WORDS. */
  readonly contextWords?: number;
};

/**
 * Serialize a ComparisonResult into the model-facing AUTHORITATIVE block. The
 * contract this honors:
 *   - EVERY insert / delete / replace segment appears, numbered, in order — the
 *     serialized list IS the authoritative set, so the model can neither miss nor
 *     invent a change.
 *   - Each change carries bounded EQUAL context on each side (see
 *     COMPARISON_CONTEXT_WORDS) so it is intelligible without dumping whole docs.
 *   - Original vs revised text is labeled explicitly per change.
 *   - Truncation (either side hit the extraction cap) is surfaced.
 *   - Identical documents produce an explicit "no changes" block, never an empty
 *     void the model might fill with speculation.
 * Pure and deterministic: the same result + options always yield the same string.
 */
export function serializeComparison(
  result: ComparisonResult,
  options: SerializeComparisonOptions,
): string {
  const contextWords = options.contextWords ?? COMPARISON_CONTEXT_WORDS;
  const { segments, summary } = result;

  const lines: string[] = [];
  lines.push('<document_comparison authoritative="true">');
  lines.push(
    "This is a deterministic, code-computed comparison of two documents. It is the complete and authoritative list of every difference between them. Treat it as ground truth: explain only the changes listed here, and do not infer, add, merge, or omit any change.",
  );
  lines.push("");
  lines.push(`Original document (older version): "${options.originalLabel}"`);
  lines.push(`Revised document (newer version): "${options.revisedLabel}"`);

  const note = truncationNote(result.truncated);
  if (note) {
    lines.push("");
    lines.push(note);
  }

  lines.push("");
  if (!summary.changed) {
    lines.push(
      "Summary: the two documents are identical after normalization.",
    );
    lines.push("");
    lines.push(
      "Changes: none. The revised document is identical to the original.",
    );
    lines.push("</document_comparison>");
    return lines.join("\n");
  }

  const { insert, delete: del, replace } = summary.segmentCounts;
  const total = insert + del + replace;
  lines.push(
    `Summary: ${plural(total, "change")} (${plural(insert, "insertion")}, ${plural(del, "deletion")}, ${plural(replace, "replacement")}); ${plural(summary.wordsInserted, "word")} added, ${plural(summary.wordsDeleted, "word")} removed.`,
  );
  lines.push("");
  lines.push("Changes:");

  let changeNum = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.type === "equal") continue;
    changeNum += 1;

    const prev = segments[i - 1];
    const next = segments[i + 1];
    const before =
      prev && prev.type === "equal" ? tailContext(prev.text, contextWords) : "";
    const after =
      next && next.type === "equal" ? headContext(next.text, contextWords) : "";

    lines.push("");
    lines.push(`Change ${changeNum} (${seg.type}):`);
    if (before) lines.push(`  Context before: "${before}"`);
    if (seg.type === "insert") {
      lines.push(`  Added in revised: "${seg.text}"`);
    } else if (seg.type === "delete") {
      lines.push(`  Removed from original: "${seg.text}"`);
    } else {
      lines.push(`  Removed from original: "${seg.oldText}"`);
      lines.push(`  Added in revised: "${seg.newText}"`);
    }
    if (after) lines.push(`  Context after: "${after}"`);
  }

  lines.push("</document_comparison>");
  return lines.join("\n");
}

/**
 * Run the document-comparison pre-step over the resolved documents. Guards run
 * FIRST, deterministically, before the engine — so a malformed request never runs
 * the comparison or a speculative model turn:
 *   - not exactly two documents (zero, one, or three+) -> friendly guard;
 *   - either document has empty / unreadable text      -> friendly guard.
 * Otherwise the engine runs over (original, revised) and the result is serialized
 * into the authoritative block.
 */
export function assembleDocumentComparePreStep(
  docs: readonly PreStepDocument[],
): DocumentComparePreStepOutcome {
  if (docs.length !== 2) {
    return { status: "guard", message: wrongCountMessage(docs.length) };
  }
  const [original, revised] = docs;
  if (original.text.trim().length === 0 || revised.text.trim().length === 0) {
    return { status: "guard", message: EMPTY_DOCUMENT_MESSAGE };
  }

  const result = compareDocuments(
    { text: original.text, truncated: original.truncated ?? false },
    { text: revised.text, truncated: revised.truncated ?? false },
  );
  return {
    status: "ready",
    authoritativeBlock: serializeComparison(result, {
      originalLabel: original.label,
      revisedLabel: revised.label,
    }),
  };
}
