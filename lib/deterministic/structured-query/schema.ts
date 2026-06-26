import { z } from "zod";

import { MAX_ATTRIBUTE_OPTION_LENGTH, MAX_ENUM_OPTIONS } from "@/lib/knowledge/collection-schema";

import type { StructuredQuery } from "./contract";

/**
 * The zod bounds for the Structured Query IR (D-200). The engine itself is pure
 * and trusts its typed input; this schema is the WRITE BOUNDARY for the IR —
 * commit 5's model emits a query, and this validates and bounds it before it is
 * run or persisted as an artifact (the same Workflows-style boundary
 * `collection-schema.ts` puts on attribute definitions). It lives beside the
 * contract so the type and its validator never drift.
 *
 * Bounds are deliberate: a query is small and model-generated, so caps keep it
 * a clean, reliable translation target and keep the persisted artifact bounded.
 */

// An attribute key reference. Bounded to the storage key length; not pattern-
// checked here because a query references keys the schema already minted (the
// engine simply finds no rows for an unknown key — an empty, honest result).
const ATTRIBUTE_KEY_MAX = 64;
const attributeRef = z.string().trim().min(1).max(ATTRIBUTE_KEY_MAX);

// A comparison value the query carries. Short by design (an equals/contains
// target, not a document); the stored values it compares against can be longer.
const QUERY_VALUE_MAX = 200;
const queryText = z.string().min(1).max(QUERY_VALUE_MAX);

// ISO calendar date, matching the `value_date` column form (YYYY-MM-DD).
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be ISO calendar dates (YYYY-MM-DD).");

const queryNumber = z.number().finite();

// A flat list with one top-level combinator covers the real questions; the
// predicate count is capped so the IR stays small and bounded.
const MAX_PREDICATES = 32;

const predicateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    attribute: attributeRef,
    op: z.enum(["equals", "not_equals", "contains"]),
    value: queryText,
  }),
  z.object({
    kind: z.literal("text_one_of"),
    attribute: attributeRef,
    values: z
      .array(z.string().trim().min(1).max(MAX_ATTRIBUTE_OPTION_LENGTH))
      .min(1, "A one-of predicate needs at least one value.")
      .max(MAX_ENUM_OPTIONS),
  }),
  z.object({
    kind: z.literal("number"),
    attribute: attributeRef,
    op: z.enum(["equals", "lt", "lte", "gt", "gte"]),
    value: queryNumber,
  }),
  z
    .object({
      kind: z.literal("number_between"),
      attribute: attributeRef,
      min: queryNumber,
      max: queryNumber,
    })
    .refine((p) => p.min <= p.max, {
      message: "A between predicate needs min ≤ max.",
      path: ["max"],
    }),
  z.object({
    kind: z.literal("date"),
    attribute: attributeRef,
    op: z.enum(["before", "after", "on"]),
    value: isoDate,
  }),
  z
    .object({
      kind: z.literal("date_between"),
      attribute: attributeRef,
      min: isoDate,
      max: isoDate,
    })
    .refine((p) => p.min <= p.max, {
      message: "A between predicate needs min ≤ max.",
      path: ["max"],
    }),
  z.object({
    kind: z.literal("boolean"),
    attribute: attributeRef,
    value: z.boolean(),
  }),
  z.object({
    kind: z.literal("presence"),
    attribute: attributeRef,
    state: z.enum(["found", "not_found", "unverified"]),
  }),
]);

export const structuredQuerySchema = z.object({
  match: z.enum(["all", "any"]),
  predicates: z.array(predicateSchema).max(MAX_PREDICATES),
  groupBy: attributeRef.optional(),
});

/**
 * Validate and bound an untrusted value (e.g. commit 5's model output) into a
 * typed `StructuredQuery`, or null when it does not conform. The validated shape
 * matches `StructuredQuery` structurally; the engine accepts the readonly view.
 */
export function parseStructuredQuery(value: unknown): StructuredQuery | null {
  const result = structuredQuerySchema.safeParse(value);
  return result.success ? (result.data as StructuredQuery) : null;
}
