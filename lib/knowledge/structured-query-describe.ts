import type {
  StructuredPredicate,
  StructuredQuery,
} from "@/lib/deterministic/structured-query";

/**
 * Render a structured-query IR (commit 4) in PLAIN LANGUAGE — the transparency
 * bridge of the question surface (commit 5). The model proposes an IR and the
 * pure engine executes it; this is what lets the user SEE what was asked of the
 * engine, in their own words rather than raw JSON ("Counting documents where
 * Agreement type is NDA and Effective date is after 2025-01-01").
 *
 * Pure and deterministic, so it is unit-tested and the shown summary can never
 * drift from the IR that actually ran. `labelOf` maps an attribute key to its
 * human label (falling back to the key, so an unknown key still reads sensibly).
 */
export function describeStructuredQuery(
  query: StructuredQuery,
  labelOf: (key: string) => string,
): string {
  const groupSuffix =
    query.groupBy !== undefined ? `, grouped by ${labelOf(query.groupBy)}` : "";

  if (query.predicates.length === 0) {
    // No filter: a pure count, optionally bucketed.
    return query.groupBy !== undefined
      ? `Counting documents by ${labelOf(query.groupBy)}`
      : "Counting all documents";
  }

  const joiner = query.match === "all" ? " and " : " or ";
  const clauses = query.predicates.map((p) => describePredicate(p, labelOf));
  return `Counting documents where ${clauses.join(joiner)}${groupSuffix}`;
}

/** One predicate as a clause. Mirrors the engine's semantics exactly so the
 * prose and the computation agree. */
function describePredicate(
  predicate: StructuredPredicate,
  labelOf: (key: string) => string,
): string {
  const label = labelOf(predicate.attribute);
  switch (predicate.kind) {
    case "text":
      if (predicate.op === "equals") return `${label} is ${quote(predicate.value)}`;
      if (predicate.op === "not_equals") return `${label} is not ${quote(predicate.value)}`;
      return `${label} contains ${quote(predicate.value)}`;
    case "text_one_of":
      return `${label} is one of ${predicate.values.map(quote).join(", ")}`;
    case "number":
      switch (predicate.op) {
        case "equals":
          return `${label} is ${predicate.value}`;
        case "lt":
          return `${label} is less than ${predicate.value}`;
        case "lte":
          return `${label} is ${predicate.value} or less`;
        case "gt":
          return `${label} is more than ${predicate.value}`;
        case "gte":
          return `${label} is ${predicate.value} or more`;
      }
      return label;
    case "number_between":
      return `${label} is between ${predicate.min} and ${predicate.max}`;
    case "date":
      if (predicate.op === "before") return `${label} is before ${predicate.value}`;
      if (predicate.op === "after") return `${label} is after ${predicate.value}`;
      return `${label} is ${predicate.value}`;
    case "date_between":
      return `${label} is between ${predicate.min} and ${predicate.max}`;
    case "boolean":
      return `${label} is ${predicate.value ? "yes" : "no"}`;
    case "presence":
      if (predicate.state === "found") return `${label} is present`;
      if (predicate.state === "not_found") return `${label} is not found`;
      return `${label} is present but unverified`;
  }
}

function quote(value: string): string {
  return `"${value}"`;
}
