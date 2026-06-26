import type {
  ExtractedAttributeValue,
  StructuredPredicate,
  StructuredQuery,
  StructuredQueryCaveats,
  StructuredQueryGroup,
  StructuredQueryResult,
} from "./contract";

/**
 * The Structured Query engine — the SECOND deterministic operation (D-200),
 * after `compareDocuments`. See `lib/deterministic/README.md` for the operation
 * contract this conforms to.
 *
 * PURE: same `(rows, query)` always produce a byte-identical
 * `StructuredQueryResult`. No I/O, no clock, no randomness, no model, no hidden
 * state. The caller (an impure loader, outside this module) fetches the
 * extracted rows and hands them in; the engine only counts and filters.
 *
 * The unit of the query is the DOCUMENT. The engine pivots the per-(document,
 * attribute) input rows into one attribute map per document, evaluates the
 * query's predicates against each document, and produces an exact count with
 * explicit honesty caveats. Determinism is unconditional: the result does not
 * depend on input row order (rows are fully sorted before pivoting, and every
 * emitted list has a defined total order).
 */

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a text value for comparison: trim, collapse internal whitespace to
 * single spaces, and lowercase. text/enum comparisons (equals, not_equals,
 * contains, one_of) and text/enum grouping are CASE- and whitespace-INSENSITIVE,
 * because legal values vary in casing and spacing ("Net 30" vs "net 30") while
 * meaning the same thing. The chosen, reported case stance for D-200.
 */
function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Deterministic, locale-independent string order (code-unit comparison, never
 * `localeCompare`, which is locale-dependent and would break determinism). */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A total, deterministic ordering key over an entire row. Used only to sort
 * input rows so that pivoting (last-wins per document+attribute) is independent
 * of input order even in the pathological case of duplicate keys (the storage
 * unique index prevents real duplicates; this keeps the engine honest anyway). */
function rowOrderKey(row: ExtractedAttributeValue): string {
  return JSON.stringify([
    row.documentId,
    row.attributeKey,
    row.attributeType,
    row.found,
    row.valueText,
    row.valueNumber,
    row.valueDate,
    row.valueBoolean,
    row.citationVerified,
    row.sourceReadIncomplete,
  ]);
}

/** Canonical number string (so `3` and `3.0` group together). */
function canonicalNumber(value: number): string {
  return String(value);
}

// ---------------------------------------------------------------------------
// Per-predicate evaluation against one document's attribute map
// ---------------------------------------------------------------------------

/** The outcome of one predicate against one document, with the honesty signals
 * the caveats aggregate. `matched` is the only field that decides membership;
 * the rest qualify WHY (so a count is never silently overclaimed). */
type PredicateEval = {
  readonly matched: boolean;
  /** A value predicate's attribute was an honest not-found for this document. */
  readonly notFound: boolean;
  /** No extraction row exists for the predicate's attribute (never extracted). */
  readonly notExtracted: boolean;
  /** A typed predicate's value was found but did not parse into its column. */
  readonly unparsed: boolean;
  /** The relevant value rests on an unverified citation. */
  readonly unverified: boolean;
  /** The relevant value (or not-found) came from a truncated read. */
  readonly truncated: boolean;
};

const NO_MATCH_NEVER_EXTRACTED: PredicateEval = {
  matched: false,
  notFound: false,
  notExtracted: true,
  unparsed: false,
  unverified: false,
  truncated: false,
};

function evaluatePredicate(
  predicate: StructuredPredicate,
  row: ExtractedAttributeValue | undefined,
): PredicateEval {
  // Presence predicates query the extraction STATE, so a not-found is the
  // answer, not a caveat. No row → the state cannot be claimed (we never looked).
  if (predicate.kind === "presence") {
    if (!row) {
      // "not_found" specifically must NOT be claimed for an unextracted doc.
      return { ...NO_MATCH_NEVER_EXTRACTED };
    }
    const matched =
      predicate.state === "found"
        ? row.found
        : predicate.state === "not_found"
          ? !row.found
          : row.found && !row.citationVerified; // "unverified"
    return {
      matched,
      notFound: false,
      notExtracted: false,
      unparsed: false,
      unverified: false,
      truncated: false,
    };
  }

  // Value predicates: only documents where the attribute was FOUND can match.
  if (!row) return { ...NO_MATCH_NEVER_EXTRACTED };
  if (!row.found) {
    return {
      matched: false,
      notFound: true,
      notExtracted: false,
      unparsed: false,
      unverified: false,
      truncated: row.sourceReadIncomplete,
    };
  }

  const matched = matchesValue(predicate, row);
  if (matched === "unparsed") {
    return {
      matched: false,
      notFound: false,
      notExtracted: false,
      unparsed: true,
      unverified: false,
      truncated: row.sourceReadIncomplete,
    };
  }
  return {
    matched,
    notFound: false,
    notExtracted: false,
    unparsed: false,
    // Verification/truncation qualify a value only when it actually matched.
    unverified: matched ? !row.citationVerified : false,
    truncated: matched ? row.sourceReadIncomplete : false,
  };
}

/**
 * Evaluate a value predicate against a FOUND row. Returns `true`/`false`, or
 * `"unparsed"` when a typed predicate's value was found but its typed column is
 * null (so the comparison cannot be made) — surfaced honestly rather than
 * silently failing the match.
 */
function matchesValue(
  predicate: StructuredPredicate,
  row: ExtractedAttributeValue,
): boolean | "unparsed" {
  switch (predicate.kind) {
    case "text": {
      const v = row.valueText;
      if (v === null) return "unparsed";
      const a = normalizeText(v);
      const b = normalizeText(predicate.value);
      if (predicate.op === "equals") return a === b;
      if (predicate.op === "not_equals") return a !== b;
      return a.includes(b); // contains
    }
    case "text_one_of": {
      const v = row.valueText;
      if (v === null) return "unparsed";
      const a = normalizeText(v);
      return predicate.values.some((candidate) => normalizeText(candidate) === a);
    }
    case "number": {
      const v = row.valueNumber;
      if (v === null) return "unparsed";
      switch (predicate.op) {
        case "equals":
          return v === predicate.value;
        case "lt":
          return v < predicate.value;
        case "lte":
          return v <= predicate.value;
        case "gt":
          return v > predicate.value;
        case "gte":
          return v >= predicate.value;
      }
      return false;
    }
    case "number_between": {
      const v = row.valueNumber;
      if (v === null) return "unparsed";
      return v >= predicate.min && v <= predicate.max; // inclusive
    }
    case "date": {
      const v = row.valueDate;
      if (v === null) return "unparsed";
      // ISO YYYY-MM-DD sorts correctly lexicographically; no Date parsing.
      if (predicate.op === "before") return v < predicate.value;
      if (predicate.op === "after") return v > predicate.value;
      return v === predicate.value; // on
    }
    case "date_between": {
      const v = row.valueDate;
      if (v === null) return "unparsed";
      return v >= predicate.min && v <= predicate.max; // inclusive
    }
    case "boolean": {
      const v = row.valueBoolean;
      if (v === null) return "unparsed";
      return v === predicate.value;
    }
    case "presence":
      // Handled by the caller; never reached.
      return false;
  }
}

// ---------------------------------------------------------------------------
// Group-by canonicalization
// ---------------------------------------------------------------------------

/** The canonical group key + representative display value for a FOUND row's
 * grouped attribute, driven by the row's SNAPSHOTTED type so grouping never
 * depends on the mutable live schema. Returns null when no usable value exists
 * (the document then falls into the synthetic not-found bucket). */
function groupValue(
  row: ExtractedAttributeValue,
): { key: string; display: string } | null {
  switch (row.attributeType) {
    case "number":
      if (row.valueNumber !== null) {
        const s = canonicalNumber(row.valueNumber);
        return { key: s, display: s };
      }
      break;
    case "date":
      if (row.valueDate !== null) return { key: row.valueDate, display: row.valueDate };
      break;
    case "boolean":
      if (row.valueBoolean !== null) {
        const s = String(row.valueBoolean);
        return { key: s, display: s };
      }
      break;
    case "text":
    case "enum":
      break;
  }
  // text/enum, or a typed value that did not parse: group by the human text.
  const text = row.valueText?.trim();
  if (text && text.length > 0) return { key: normalizeText(text), display: text };
  return null;
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

const NOT_FOUND_BUCKET_KEY = " not-found"; // sentinel; cannot collide with a real key

type MutableGroup = { display: string; found: boolean; count: number; unverifiedCount: number };

/**
 * Run a structured query over already-extracted rows. Pure and deterministic.
 *
 * @param rows  One row per (document, attribute) — the engine's input contract
 *              (`ExtractedAttributeValue`), already loaded by the caller.
 * @param query The typed structured query (the IR).
 */
export function runStructuredQuery(
  rows: readonly ExtractedAttributeValue[],
  query: StructuredQuery,
): StructuredQueryResult {
  // Pivot rows → one attribute map per document. Sort first so the result is
  // independent of input order even with duplicate keys (last-wins after a total
  // sort is deterministic).
  const sorted = [...rows].sort((a, b) => compareStrings(rowOrderKey(a), rowOrderKey(b)));
  const byDocument = new Map<string, Map<string, ExtractedAttributeValue>>();
  for (const row of sorted) {
    let attrs = byDocument.get(row.documentId);
    if (!attrs) {
      attrs = new Map();
      byDocument.set(row.documentId, attrs);
    }
    attrs.set(row.attributeKey, row);
  }

  const documentIds = [...byDocument.keys()].sort(compareStrings);

  const caveats = {
    matchedOnUnverifiedCitation: 0,
    matchedOnTruncatedRead: 0,
    excludedNotFound: 0,
    excludedNotFoundTruncated: 0,
    excludedUnparsedValue: 0,
    notExtracted: 0,
  };
  const matchedDocumentIds: string[] = [];
  const groups = new Map<string, MutableGroup>();
  const grouping = query.groupBy !== undefined;

  for (const documentId of documentIds) {
    const attrs = byDocument.get(documentId)!;
    const evals = query.predicates.map((predicate) =>
      evaluatePredicate(predicate, attrs.get(predicate.attribute)),
    );

    // Combine. An empty predicate list matches every document in scope.
    const matched =
      evals.length === 0
        ? true
        : query.match === "all"
          ? evals.every((e) => e.matched)
          : evals.some((e) => e.matched);

    if (matched) {
      matchedDocumentIds.push(documentId);
      // A value qualifies the match only when it was one of the matching
      // predicates (under "all" that is all of them; under "any", the true ones).
      const contributing = evals.filter((e) => e.matched);
      if (contributing.some((e) => e.unverified)) caveats.matchedOnUnverifiedCitation += 1;
      if (contributing.some((e) => e.truncated)) caveats.matchedOnTruncatedRead += 1;
      if (grouping) tallyGroup(groups, attrs.get(query.groupBy!));
    } else {
      // Honest qualification of WHY a document was excluded (each at most once).
      if (evals.some((e) => e.notFound)) caveats.excludedNotFound += 1;
      if (evals.some((e) => e.notFound && e.truncated)) caveats.excludedNotFoundTruncated += 1;
      if (evals.some((e) => e.unparsed)) caveats.excludedUnparsedValue += 1;
      if (evals.some((e) => e.notExtracted)) caveats.notExtracted += 1;
    }
  }

  return {
    total: documentIds.length,
    matched: matchedDocumentIds.length,
    matchedDocumentIds, // already in sorted-id order
    caveats: caveats satisfies StructuredQueryCaveats,
    groupBy: grouping ? query.groupBy! : null,
    groups: grouping ? finalizeGroups(groups) : null,
    distinctValueCount: grouping ? countFoundGroups(groups) : null,
    query,
  };
}

/** Add one matched document to its group-by bucket. Documents are visited in
 * sorted-id order, so the first display value seen for a bucket (the
 * representative) comes from the lowest document id — deterministic. */
function tallyGroup(
  groups: Map<string, MutableGroup>,
  row: ExtractedAttributeValue | undefined,
): void {
  const resolved = row && row.found ? groupValue(row) : null;
  const key = resolved ? resolved.key : NOT_FOUND_BUCKET_KEY;
  const display = resolved ? resolved.display : "";
  const found = resolved !== null;
  let bucket = groups.get(key);
  if (!bucket) {
    bucket = { display, found, count: 0, unverifiedCount: 0 };
    groups.set(key, bucket);
  }
  bucket.count += 1;
  if (row && row.found && !row.citationVerified) bucket.unverifiedCount += 1;
}

/** Order buckets deterministically: count descending, then found buckets before
 * the synthetic not-found bucket, then value ascending (code-unit). */
function finalizeGroups(groups: Map<string, MutableGroup>): StructuredQueryGroup[] {
  return [...groups.values()]
    .map(
      (g): StructuredQueryGroup => ({
        value: g.display,
        found: g.found,
        count: g.count,
        unverifiedCount: g.unverifiedCount,
      }),
    )
    .sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      if (a.found !== b.found) return a.found ? -1 : 1;
      return compareStrings(a.value, b.value);
    });
}

function countFoundGroups(groups: Map<string, MutableGroup>): number {
  let n = 0;
  for (const g of groups.values()) if (g.found) n += 1;
  return n;
}
