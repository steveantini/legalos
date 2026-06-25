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
 * ROLES, not order (D-188): each document carries an EXPLICIT role — "original" or
 * "revised" — set by the two-slot input UI and carried through the send payload.
 * The pre-step reads documents by role, never by position. (This replaced the
 * commit-2/3 interim convention of "first attachment = original, second =
 * revised", which is fully retired.)
 */

import {
  compareDocuments,
  type ComparisonResult,
} from "@/lib/deterministic/compare";

/** Which version of the document this is, in the comparison. */
export type CompareRole = "original" | "revised";

/**
 * One document handed to the pre-step: its explicit ROLE, a human label (its
 * filename), and already-extracted, normalized text (lib/extract output — NEVER
 * re-extracted here). `truncated` is the caller's honest signal that this document
 * hit the extraction cap; it is surfaced verbatim in the serialized block.
 */
export type PreStepDocument = {
  readonly role: CompareRole;
  readonly label: string;
  readonly text: string;
  readonly truncated?: boolean;
};

/**
 * The structured change set carried to the CLIENT for the visual redline (D-189).
 * It is the SAME ComparisonResult the model-facing block was serialized from, so
 * the prose explanation and the visual redline share one source and cannot
 * disagree; the renderer walks `segments` and never runs a second diff. The
 * normalized full texts are deliberately omitted (the renderer needs only the
 * segments, which already carry their text); `summary` drives the header counts
 * and the identical-docs state, `truncated` drives the partial-comparison notice.
 */
export type RedlinePayload = {
  readonly segments: ComparisonResult["segments"];
  readonly summary: ComparisonResult["summary"];
  readonly truncated: ComparisonResult["truncated"];
  readonly originalLabel: string;
  readonly revisedLabel: string;
};

/**
 * Rehydrate a persisted RedlinePayload from the messages.pre_step_result jsonb
 * column on reload (D-193). The value is OUR OWN write (the exact RedlinePayload
 * the pre-step produced and the live SSE event carried), so this is a structural
 * sanity guard, not a deep validator: it confirms the top-level shape is intact
 * and returns the value typed, or `undefined` so the caller degrades to prose-only
 * (the pre-D-193 reload behavior) for a null, legacy, or malformed value. It does
 * NOT recompute a diff — the persisted change set is the single source of truth.
 */
export function coerceRedlinePayload(
  value: unknown,
): RedlinePayload | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.segments)) return undefined;
  if (!v.summary || typeof v.summary !== "object") return undefined;
  if (!v.truncated || typeof v.truncated !== "object") return undefined;
  if (typeof v.originalLabel !== "string") return undefined;
  if (typeof v.revisedLabel !== "string") return undefined;
  return value as RedlinePayload;
}

/**
 * The pre-step's outcome. Either the run is READY (the authoritative change-set
 * block is built and ready to inject as the model's input, plus the structured
 * redline payload for the client) or a GUARD fired (the pre-step cannot run; the
 * user gets a clear, friendly message and NO model turn).
 */
export type DocumentComparePreStepOutcome =
  | {
      readonly status: "ready";
      readonly authoritativeBlock: string;
      readonly redline: RedlinePayload;
    }
  | { readonly status: "guard"; readonly message: string };

/**
 * Words of unchanged text shown on each side of a change for context. Bounded so
 * a large document does not dump its full equal text into the block, while still
 * giving the model enough to locate each change. Word-based and deterministic.
 */
export const COMPARISON_CONTEXT_WORDS = 6;

/**
 * Role-aware guard copy, USER-FACING (kept free of em dashes per the copy
 * convention). Each message names the specific role that is missing or unreadable,
 * so the user knows exactly which slot to fill rather than a generic "needs two".
 */
const GUARD_MESSAGES = {
  bothMissing:
    "This agent compares two versions of a document. Add the original version and the revised version, then send your message again.",
  missingOriginal:
    "Add the original version to compare against the revised version, then send your message again.",
  missingRevised:
    "Add the revised version to compare against the original, then send your message again.",
  emptyOriginal:
    "The original document has no readable text, so there is nothing to compare. Add an original version that contains text, then try again.",
  emptyRevised:
    "The revised document has no readable text, so there is nothing to compare. Add a revised version that contains text, then try again.",
} as const;

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
 * Run the document-comparison pre-step over the resolved documents, reading each
 * by its explicit ROLE (never by position). Guards run FIRST, deterministically,
 * before the engine, and each names the specific role at fault, so a malformed
 * request never runs the comparison or a speculative model turn:
 *   - neither role provided          -> "add the original and the revised";
 *   - the original slot is empty      -> "add the original version ...";
 *   - the revised slot is empty       -> "add the revised version ...";
 *   - a provided slot has no text     -> role-named empty-document guard.
 * Otherwise the engine runs over (original, revised) and the result is serialized
 * into the authoritative block. Extra documents in a role (the UI allows one per
 * slot) resolve to the first of that role; a document with no role is ignored
 * (the two-slot UI always sets one).
 */
export function assembleDocumentComparePreStep(
  docs: readonly PreStepDocument[],
): DocumentComparePreStepOutcome {
  const original = docs.find((d) => d.role === "original");
  const revised = docs.find((d) => d.role === "revised");

  if (!original && !revised) {
    return { status: "guard", message: GUARD_MESSAGES.bothMissing };
  }
  if (!original) {
    return { status: "guard", message: GUARD_MESSAGES.missingOriginal };
  }
  if (!revised) {
    return { status: "guard", message: GUARD_MESSAGES.missingRevised };
  }
  if (original.text.trim().length === 0) {
    return { status: "guard", message: GUARD_MESSAGES.emptyOriginal };
  }
  if (revised.text.trim().length === 0) {
    return { status: "guard", message: GUARD_MESSAGES.emptyRevised };
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
    // The redline payload is derived from the SAME `result` the block was
    // serialized from: one computed change set drives both the prose and the
    // visual redline, so they cannot disagree (D-189).
    redline: {
      segments: result.segments,
      summary: result.summary,
      truncated: result.truncated,
      originalLabel: original.label,
      revisedLabel: revised.label,
    },
  };
}
