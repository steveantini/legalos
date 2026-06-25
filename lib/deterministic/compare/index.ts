/**
 * Public surface of the document-comparison operation (D-185).
 *
 * The engine (`compareDocuments`) and the change-set contract are public; the
 * internal stages (`normalize`, `segment`, `diff`, `emit`) are implementation
 * detail, exported from their own modules only for unit testing.
 */
export { compareDocuments } from "./compare";
export type {
  ChangeSegment,
  ChangeType,
  ComparisonDocument,
  ComparisonResult,
  ComparisonSummary,
  Granularity,
  Span,
} from "./contract";
