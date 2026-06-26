import { describe, expect, it } from "vitest";

import { parseStructuredQuery, structuredQuerySchema } from "./schema";

/** The IR's write boundary (D-200): commit 5's model output is validated and
 * bounded here before it is run or persisted. */
describe("structuredQuerySchema", () => {
  it("accepts a well-formed multi-predicate query with group-by", () => {
    const query = {
      match: "all",
      predicates: [
        { kind: "text", attribute: "version", op: "equals", value: "3" },
        { kind: "number_between", attribute: "value", min: 100, max: 500 },
        { kind: "date", attribute: "signed", op: "after", value: "2025-01-01" },
        { kind: "presence", attribute: "counterparty", state: "not_found" },
      ],
      groupBy: "version",
    };
    expect(structuredQuerySchema.safeParse(query).success).toBe(true);
    expect(parseStructuredQuery(query)).not.toBeNull();
  });

  it("accepts an empty predicate list (match all in scope)", () => {
    expect(parseStructuredQuery({ match: "all", predicates: [] })).toEqual({
      match: "all",
      predicates: [],
    });
  });

  it("rejects an unknown predicate kind", () => {
    expect(
      parseStructuredQuery({
        match: "all",
        predicates: [{ kind: "regex", attribute: "v", value: ".*" }],
      }),
    ).toBeNull();
  });

  it("rejects an unknown operator for a known kind", () => {
    expect(
      parseStructuredQuery({
        match: "all",
        predicates: [{ kind: "number", attribute: "v", op: "approximately", value: 3 }],
      }),
    ).toBeNull();
  });

  it("rejects a non-ISO date value", () => {
    expect(
      parseStructuredQuery({
        match: "all",
        predicates: [{ kind: "date", attribute: "signed", op: "on", value: "June 1, 2025" }],
      }),
    ).toBeNull();
  });

  it("rejects a between predicate with min > max", () => {
    expect(
      parseStructuredQuery({
        match: "all",
        predicates: [{ kind: "number_between", attribute: "v", min: 500, max: 100 }],
      }),
    ).toBeNull();
  });

  it("rejects a one_of predicate with no values", () => {
    expect(
      parseStructuredQuery({
        match: "all",
        predicates: [{ kind: "text_one_of", attribute: "v", values: [] }],
      }),
    ).toBeNull();
  });

  it("rejects a non-finite number", () => {
    expect(
      parseStructuredQuery({
        match: "all",
        predicates: [{ kind: "number", attribute: "v", op: "gt", value: Infinity }],
      }),
    ).toBeNull();
  });

  it("rejects an invalid match combinator", () => {
    expect(parseStructuredQuery({ match: "either", predicates: [] })).toBeNull();
  });

  it("rejects a malformed (non-object) input", () => {
    expect(parseStructuredQuery("not a query")).toBeNull();
    expect(parseStructuredQuery(null)).toBeNull();
  });
});
