/**
 * The document-comparison change-set contract (D-185) — the binding, long-lived
 * interface every downstream consumer depends on. Designed to serve BOTH:
 *
 *   (a) a visual REDLINE renderer — the `segments` are a unified, ordered,
 *       lossless sequence covering BOTH normalized documents, so a renderer
 *       walks them once and maps each `type` to a style (equal = plain,
 *       insert = underline, delete = strike, replace = strike old + underline
 *       new). No position is re-derived: every segment carries explicit
 *       character spans into both documents.
 *
 *   (b) a MODEL reading the change set as AUTHORITATIVE input — the model
 *       explains the materiality of changes it can see but cannot alter. Because
 *       the only "change" segments are insert / delete / replace (equal segments
 *       merely anchor them in context), the model cannot report a change the
 *       deterministic engine did not produce.
 *
 * Why a unified segment sequence rather than a flat list of changes: a flat list
 * forces every consumer to re-interleave changes with the unchanged text by
 * position — exactly the re-derivation we want to forbid. The unified sequence
 * is the canonical diff representation (Myers / a redline view): it renders
 * inline trivially and reconstructs both documents losslessly. `replace` is a
 * first-class segment (not a delete+insert pair) because a substitution is the
 * unit of legal materiality ("Net 30" -> "Net 60") and groups cleanly in a
 * redline.
 *
 * v1 granularity is WORD-level textual diff over normalized text. Structural /
 * clause-level / semantic-equivalence diffing (moved clauses, reordered
 * sections) is explicitly a FUTURE layer, not in this contract.
 */

/** A half-open character range `[start, end)` into a normalized document text. */
export type Span = {
  readonly start: number;
  readonly end: number;
};

/**
 * Segmentation granularity. WORD-level is the only v1 member; the type is the
 * extension point for future sentence / line / character granularities (which
 * are deliberately NOT built in v1).
 */
export type Granularity = "word";

/**
 * One segment of the unified comparison sequence. Discriminated on `type`.
 * Every segment carries BOTH spans; the side that does not apply to a segment
 * gets a ZERO-WIDTH span (`start === end`) at the position where the change
 * sits in that document, so spans are total and a consumer never handles null.
 *
 *   - equal:   text identical in both. `text` present; both spans non-empty.
 *   - insert:  text present only in the new doc. `text` is the inserted content;
 *              `newSpan` non-empty, `oldSpan` zero-width at the insertion point.
 *   - delete:  text present only in the old doc. `text` is the removed content;
 *              `oldSpan` non-empty, `newSpan` zero-width at the deletion point.
 *   - replace: old text substituted by new text. Both `oldText`/`newText` and
 *              both spans non-empty.
 */
export type ChangeSegment =
  | {
      readonly type: "equal";
      readonly text: string;
      readonly oldSpan: Span;
      readonly newSpan: Span;
    }
  | {
      readonly type: "insert";
      readonly text: string;
      readonly oldSpan: Span;
      readonly newSpan: Span;
    }
  | {
      readonly type: "delete";
      readonly text: string;
      readonly oldSpan: Span;
      readonly newSpan: Span;
    }
  | {
      readonly type: "replace";
      readonly oldText: string;
      readonly newText: string;
      readonly oldSpan: Span;
      readonly newSpan: Span;
    };

export type ChangeType = ChangeSegment["type"];

/**
 * At-a-glance materiality, derived PURELY from `segments` (no independent
 * computation). `changed` is the explicit "are these documents different after
 * normalization" signal: false for identical (or both-empty) inputs.
 */
export type ComparisonSummary = {
  /** False iff the documents are identical after normalization (no insert/delete/replace). */
  readonly changed: boolean;
  readonly segmentCounts: {
    readonly equal: number;
    readonly insert: number;
    readonly delete: number;
    readonly replace: number;
  };
  /** Words introduced by insert + replace (new side). */
  readonly wordsInserted: number;
  /** Words removed by delete + replace (old side). */
  readonly wordsDeleted: number;
};

/**
 * One side's input: already-extracted plain text (the `lib/extract` layer has
 * already stripped formatting; this engine does NOT re-extract). `truncated`
 * is informational passthrough: the engine imposes NO size cap of its own, but
 * `lib/extract` truncates extraction at `ATTACHMENT_TEXT_LIMIT` (100,000 chars),
 * so a caller that hit the cap sets `truncated: true` and the engine surfaces it
 * in the result for honest downstream display.
 */
export type ComparisonDocument = {
  readonly text: string;
  readonly truncated?: boolean;
};

/**
 * The full structured result. `normalizedOld` / `normalizedNew` are the
 * coordinate space the spans index into, returned so spans are self-contained
 * (a consumer resolves any span without re-deriving position).
 */
export type ComparisonResult = {
  readonly segments: readonly ChangeSegment[];
  readonly summary: ComparisonSummary;
  /** The normalized old/new texts the spans index into (the engine's coordinate space). */
  readonly normalizedOld: string;
  readonly normalizedNew: string;
  readonly granularity: Granularity;
  /** Informational passthrough from the extraction layer (it owns the 100k cap, not us). */
  readonly truncated: { readonly old: boolean; readonly new: boolean };
};
