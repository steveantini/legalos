/**
 * Public surface of the Structured Query operation (D-200) — the second
 * deterministic operation, after document comparison.
 *
 * The pure engine (`runStructuredQuery`), the IR validator
 * (`structuredQuerySchema` / `parseStructuredQuery`), and the contract types are
 * public; there are no internal stages to hide (the engine is a single pure
 * function with private helpers).
 */
export { runStructuredQuery } from "./engine";
export { parseStructuredQuery, structuredQuerySchema } from "./schema";
export type {
  DateCompareOp,
  ExtractedAttributeValue,
  NumberCompareOp,
  PredicateKind,
  PresenceState,
  StructuredPredicate,
  StructuredQuery,
  StructuredQueryCaveats,
  StructuredQueryGroup,
  StructuredQueryResult,
  TextCompareOp,
} from "./contract";
