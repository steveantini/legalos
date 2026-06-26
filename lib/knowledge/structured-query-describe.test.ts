import { describe, expect, it } from "vitest";

import type { StructuredQuery } from "@/lib/deterministic/structured-query";

import { describeStructuredQuery } from "./structured-query-describe";

// A label map standing in for a collection's schema labels.
const labels: Record<string, string> = {
  agreement_type: "Agreement type",
  effective_date: "Effective date",
  value: "Contract value",
  auto_renews: "Auto renews",
};
const labelOf = (key: string) => labels[key] ?? key;

describe("describeStructuredQuery", () => {
  it("renders a pure count with no predicates", () => {
    const q: StructuredQuery = { match: "all", predicates: [] };
    expect(describeStructuredQuery(q, labelOf)).toBe("Counting all documents");
  });

  it("renders a group-by count with no predicates", () => {
    const q: StructuredQuery = { match: "all", predicates: [], groupBy: "agreement_type" };
    expect(describeStructuredQuery(q, labelOf)).toBe("Counting documents by Agreement type");
  });

  it("renders a single text equals clause with the label", () => {
    const q: StructuredQuery = {
      match: "all",
      predicates: [{ kind: "text", attribute: "agreement_type", op: "equals", value: "NDA" }],
    };
    expect(describeStructuredQuery(q, labelOf)).toBe(
      'Counting documents where Agreement type is "NDA"',
    );
  });

  it("joins multiple predicates with and / or per the combinator", () => {
    const predicates = [
      { kind: "text", attribute: "agreement_type", op: "equals", value: "NDA" },
      { kind: "date", attribute: "effective_date", op: "after", value: "2025-01-01" },
    ] as const;
    expect(
      describeStructuredQuery({ match: "all", predicates: [...predicates] }, labelOf),
    ).toBe('Counting documents where Agreement type is "NDA" and Effective date is after 2025-01-01');
    expect(
      describeStructuredQuery({ match: "any", predicates: [...predicates] }, labelOf),
    ).toBe('Counting documents where Agreement type is "NDA" or Effective date is after 2025-01-01');
  });

  it("renders number operators and between", () => {
    expect(
      describeStructuredQuery(
        { match: "all", predicates: [{ kind: "number", attribute: "value", op: "gte", value: 100 }] },
        labelOf,
      ),
    ).toBe("Counting documents where Contract value is 100 or more");
    expect(
      describeStructuredQuery(
        {
          match: "all",
          predicates: [{ kind: "number_between", attribute: "value", min: 100, max: 500 }],
        },
        labelOf,
      ),
    ).toBe("Counting documents where Contract value is between 100 and 500");
  });

  it("renders boolean, presence, one_of, and group-by together", () => {
    expect(
      describeStructuredQuery(
        { match: "all", predicates: [{ kind: "boolean", attribute: "auto_renews", value: true }] },
        labelOf,
      ),
    ).toBe("Counting documents where Auto renews is yes");
    expect(
      describeStructuredQuery(
        {
          match: "all",
          predicates: [{ kind: "presence", attribute: "effective_date", state: "not_found" }],
        },
        labelOf,
      ),
    ).toBe("Counting documents where Effective date is not found");
    expect(
      describeStructuredQuery(
        {
          match: "all",
          predicates: [{ kind: "text_one_of", attribute: "agreement_type", values: ["NDA", "MSA"] }],
          groupBy: "agreement_type",
        },
        labelOf,
      ),
    ).toBe('Counting documents where Agreement type is one of "NDA", "MSA", grouped by Agreement type');
  });

  it("falls back to the raw key when no label is known", () => {
    const q: StructuredQuery = {
      match: "all",
      predicates: [{ kind: "text", attribute: "mystery", op: "equals", value: "x" }],
    };
    expect(describeStructuredQuery(q, labelOf)).toBe('Counting documents where mystery is "x"');
  });
});
