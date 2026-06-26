import type { CollectionAttributeType } from "@/lib/knowledge/collection-schema";

/**
 * The Structured Query contract (D-200) — the binding interface between the
 * model that TRANSLATES a natural-language question into a query (commit 5) and
 * the PURE ENGINE that answers it (this commit). Three pieces live here:
 *
 *   1. `ExtractedAttributeValue` — the engine's INPUT row shape. One row per
 *      (document, attribute), exactly the subset of a stored `document_extractions`
 *      row the engine reads. It is intentionally DECOUPLED from the extraction /
 *      storage type (`ExtractionResultRow` in the impure extraction layer): the
 *      loader maps DB rows into this, so the pure engine never depends on the
 *      storage schema and stays self-contained.
 *
 *   2. `StructuredQuery` — the intermediate representation (IR). This is what
 *      commit 5's model emits and what gets persisted as the interpreted-query
 *      artifact, so it is fully typed, serializable, and BOUNDED (see
 *      `schema.ts`). It is deliberately small: a flat list of predicates with a
 *      single top-level combinator and an optional group-by. No nested boolean
 *      tree (see "Why flat" below).
 *
 *   3. `StructuredQueryResult` — the exact, repeatable answer. A headline count
 *      plus the matching document ids, optional group-by buckets, and EXPLICIT
 *      honesty caveats (not-found, truncated reads, unverified citations,
 *      unparsed values) so a count is never silently overclaimed.
 *
 * The engine over these is a PURE OPERATION (D-185): same (rows, query) always
 * produce a byte-identical result. See `lib/deterministic/README.md`.
 *
 * --- Why FLAT (no nested boolean tree) ---
 * Phase one supports a flat list of predicates combined by ONE top-level
 * `match` ("all" = AND, "any" = OR), plus OR-WITHIN-AN-ATTRIBUTE via the
 * `text_one_of` / `*_between` predicates. This covers the real questions ("how
 * many contracts on version 3 signed after Jan 1", "how many auto-renew") while
 * staying bounded and reliable as a model translation target: a full
 * arbitrarily-nested AND/OR/NOT tree is unbounded, far harder for the model to
 * emit correctly, and not needed for the questions a prepared collection
 * actually answers. Nesting is a deliberate non-goal here, not an oversight; if
 * a real question ever needs it, it becomes a future predicate kind, not a
 * retrofit of this shape.
 */

// ---------------------------------------------------------------------------
// Engine input: one extracted value per (document, attribute)
// ---------------------------------------------------------------------------

/**
 * One extracted (document, attribute) value as the engine reads it — the pure
 * subset of a `document_extractions` row. The loader (impure, outside this
 * module) produces these from the DB; the engine never reads more than this.
 *
 * `attributeType` is the type SNAPSHOTTED on the row at extraction, so the
 * engine selects the correct typed column for group-by without depending on the
 * mutable live schema. The four typed columns mirror storage: text/enum query
 * on `valueText`, number on `valueNumber`, date on `valueDate` (ISO `YYYY-MM-DD`),
 * boolean on `valueBoolean`. A `found: false` row is an HONEST not-found (we
 * looked and it is not there), distinct from no row at all (never extracted).
 */
export type ExtractedAttributeValue = {
  readonly documentId: string;
  readonly attributeKey: string;
  readonly attributeType: CollectionAttributeType;
  /** True only when the value was actually found in the document. */
  readonly found: boolean;
  readonly valueText: string | null;
  readonly valueNumber: number | null;
  /** ISO calendar date `YYYY-MM-DD`, or null. Sorts correctly lexicographically. */
  readonly valueDate: string | null;
  readonly valueBoolean: boolean | null;
  /** False when the supporting quote could not be verified against the source. */
  readonly citationVerified: boolean;
  /** True when this value was read from a document truncated at the read budget. */
  readonly sourceReadIncomplete: boolean;
};

// ---------------------------------------------------------------------------
// The structured query (IR)
// ---------------------------------------------------------------------------

/** Comparison operators for a text/enum attribute (all case-insensitive, see
 * the engine). `one_of` is its own predicate kind because it carries a set. */
export type TextCompareOp = "equals" | "not_equals" | "contains";

/** Comparison operators for a number attribute. `between` is its own kind. */
export type NumberCompareOp = "equals" | "lt" | "lte" | "gt" | "gte";

/** Comparison operators for a date attribute. `between` is its own kind;
 * `on` is date-equality. Values are ISO `YYYY-MM-DD`. */
export type DateCompareOp = "before" | "after" | "on";

/**
 * Presence operators — about the EXTRACTION STATE of an attribute, not its
 * value, so "how many documents where we could not find the version" is a
 * first-class question (an honesty feature). `unverified` = found but the
 * citation could not be verified against the source.
 */
export type PresenceState = "found" | "not_found" | "unverified";

/**
 * One predicate. Discriminated on `kind`, where each kind names BOTH the
 * attribute domain (which drives nothing at eval time — the predicate carries
 * its own operands) and the operand shape, so every variant is a complete,
 * self-describing record with no optional-field ambiguity. This shape is exactly
 * what `z.discriminatedUnion("kind", ...)` validates in `schema.ts`.
 *
 * Value predicates (text/number/date/boolean and their `*_one_of`/`*_between`
 * siblings) consider ONLY documents where the attribute was found: a not-found
 * or never-extracted value is never silently treated as a match. Presence
 * predicates query the state itself.
 */
export type StructuredPredicate =
  | {
      readonly kind: "text";
      readonly attribute: string;
      readonly op: TextCompareOp;
      readonly value: string;
    }
  | {
      readonly kind: "text_one_of";
      readonly attribute: string;
      readonly values: readonly string[];
    }
  | {
      readonly kind: "number";
      readonly attribute: string;
      readonly op: NumberCompareOp;
      readonly value: number;
    }
  | {
      readonly kind: "number_between";
      readonly attribute: string;
      /** Inclusive lower bound. */
      readonly min: number;
      /** Inclusive upper bound. */
      readonly max: number;
    }
  | {
      readonly kind: "date";
      readonly attribute: string;
      readonly op: DateCompareOp;
      /** ISO `YYYY-MM-DD`. */
      readonly value: string;
    }
  | {
      readonly kind: "date_between";
      readonly attribute: string;
      /** Inclusive lower bound, ISO `YYYY-MM-DD`. */
      readonly min: string;
      /** Inclusive upper bound, ISO `YYYY-MM-DD`. */
      readonly max: string;
    }
  | {
      readonly kind: "boolean";
      readonly attribute: string;
      readonly value: boolean;
    }
  | {
      readonly kind: "presence";
      readonly attribute: string;
      readonly state: PresenceState;
    };

/** The predicate kind discriminator, for exhaustive handling. */
export type PredicateKind = StructuredPredicate["kind"];

/**
 * A structured query: a flat list of predicates combined by `match`, with an
 * optional group-by. An EMPTY predicate list matches every document in scope
 * (so "how many documents" and "group all documents by version" are expressible).
 */
export type StructuredQuery = {
  /** "all" = every predicate must hold (AND); "any" = at least one (OR). */
  readonly match: "all" | "any";
  readonly predicates: readonly StructuredPredicate[];
  /** When set, matched documents are bucketed by this attribute's value. */
  readonly groupBy?: string;
};

// ---------------------------------------------------------------------------
// The result
// ---------------------------------------------------------------------------

/**
 * Explicit honesty accounting for a count — never hidden. Each field counts
 * DOCUMENTS (a document contributes at most once per field).
 */
export type StructuredQueryCaveats = {
  /** Matched documents resting on at least one value with an unverified citation. */
  readonly matchedOnUnverifiedCitation: number;
  /** Matched documents resting on at least one value read from a truncated document. */
  readonly matchedOnTruncatedRead: number;
  /** Excluded documents where a referenced attribute was an honest not-found. */
  readonly excludedNotFound: number;
  /** Of `excludedNotFound`, those whose not-found came from a truncated read
   * (so the not-found is qualified, not definitive). */
  readonly excludedNotFoundTruncated: number;
  /** Excluded documents where a typed predicate's value was found but could not
   * be parsed into its typed column (so it could not be compared). */
  readonly excludedUnparsedValue: number;
  /** Excluded documents missing any extraction row for a referenced attribute
   * (never extracted, distinct from an honest not-found). */
  readonly notExtracted: number;
};

/**
 * One group-by bucket. `found: false` is the single synthetic bucket for matched
 * documents where the grouped attribute was not found (or never extracted),
 * carrying an empty `value` — so "how many of each version, and how many we
 * could not find a version for" is one honest distribution.
 */
export type StructuredQueryGroup = {
  /** Representative original value (from the lowest document id in the bucket);
   * empty string for the synthetic not-found bucket. */
  readonly value: string;
  /** False only for the synthetic not-found bucket. */
  readonly found: boolean;
  readonly count: number;
  /** Of `count`, documents whose grouped value rests on an unverified citation. */
  readonly unverifiedCount: number;
};

/**
 * The exact, repeatable answer. `matchedDocumentIds` (sorted) lets the caller
 * show "which documents" and load their citations; `caveats` and per-bucket
 * `unverifiedCount` make the count's honesty explicit; `query` is echoed so the
 * result is a self-describing artifact (commit 5 persists it).
 */
export type StructuredQueryResult = {
  /** Documents in scope (distinct document ids across the input rows). */
  readonly total: number;
  /** Documents satisfying the query. */
  readonly matched: number;
  /** The matched document ids, sorted ascending (code-unit order). */
  readonly matchedDocumentIds: readonly string[];
  readonly caveats: StructuredQueryCaveats;
  /** The group-by attribute, or null when the query did not group. */
  readonly groupBy: string | null;
  /** Buckets over matched documents, or null when the query did not group. */
  readonly groups: readonly StructuredQueryGroup[] | null;
  /** Count of distinct FOUND values among matched documents when grouped; null
   * when the query did not group. */
  readonly distinctValueCount: number | null;
  /** The query that produced this result, echoed for the persisted artifact. */
  readonly query: StructuredQuery;
};
