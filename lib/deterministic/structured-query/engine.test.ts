import { describe, expect, it } from "vitest";

import type { CollectionAttributeType } from "@/lib/knowledge/collection-schema";

import type { ExtractedAttributeValue, StructuredQuery } from "./contract";
import { runStructuredQuery } from "./engine";

/**
 * Test density to the comparison-engine bar (D-185/D-200). Every predicate type
 * and operator, AND/OR combination, group-by, type-correct column selection,
 * honest not-found / unverified / truncated / unparsed / not-extracted handling,
 * the empty and all-not-found edges, group-ordering ties, and the determinism
 * guarantee (shuffled rows → identical result) are pinned here.
 */

// A row builder with safe defaults: a found, verified, fully-read value.
function row(
  overrides: Partial<ExtractedAttributeValue> &
    Pick<ExtractedAttributeValue, "documentId" | "attributeKey" | "attributeType">,
): ExtractedAttributeValue {
  return {
    found: true,
    valueText: null,
    valueNumber: null,
    valueDate: null,
    valueBoolean: null,
    citationVerified: true,
    sourceReadIncomplete: false,
    ...overrides,
  };
}

function textRow(
  documentId: string,
  attributeKey: string,
  value: string,
  extra: Partial<ExtractedAttributeValue> = {},
  type: CollectionAttributeType = "text",
): ExtractedAttributeValue {
  return row({ documentId, attributeKey, attributeType: type, valueText: value, ...extra });
}

function numberRow(
  documentId: string,
  attributeKey: string,
  value: number,
  extra: Partial<ExtractedAttributeValue> = {},
): ExtractedAttributeValue {
  return row({
    documentId,
    attributeKey,
    attributeType: "number",
    valueText: String(value),
    valueNumber: value,
    ...extra,
  });
}

function dateRow(
  documentId: string,
  attributeKey: string,
  value: string,
  extra: Partial<ExtractedAttributeValue> = {},
): ExtractedAttributeValue {
  return row({
    documentId,
    attributeKey,
    attributeType: "date",
    valueText: value,
    valueDate: value,
    ...extra,
  });
}

function boolRow(
  documentId: string,
  attributeKey: string,
  value: boolean,
  extra: Partial<ExtractedAttributeValue> = {},
): ExtractedAttributeValue {
  return row({
    documentId,
    attributeKey,
    attributeType: "boolean",
    valueText: value ? "yes" : "no",
    valueBoolean: value,
    ...extra,
  });
}

function notFoundRow(
  documentId: string,
  attributeKey: string,
  type: CollectionAttributeType,
  extra: Partial<ExtractedAttributeValue> = {},
): ExtractedAttributeValue {
  return row({
    documentId,
    attributeKey,
    attributeType: type,
    found: false,
    citationVerified: false,
    ...extra,
  });
}

const ZERO_CAVEATS = {
  matchedOnUnverifiedCitation: 0,
  matchedOnTruncatedRead: 0,
  excludedNotFound: 0,
  excludedNotFoundTruncated: 0,
  excludedUnparsedValue: 0,
  notExtracted: 0,
};

describe("runStructuredQuery — text predicates", () => {
  const rows = [
    textRow("d1", "law", "California", {}, "enum"),
    textRow("d2", "law", "new york", {}, "enum"),
    textRow("d3", "law", "California"),
  ];

  it("equals is case- and whitespace-insensitive", () => {
    const q: StructuredQuery = {
      match: "all",
      predicates: [{ kind: "text", attribute: "law", op: "equals", value: "  california " }],
    };
    const r = runStructuredQuery(rows, q);
    expect(r.matched).toBe(2);
    expect(r.matchedDocumentIds).toEqual(["d1", "d3"]);
    expect(r.total).toBe(3);
  });

  it("not_equals matches found values that differ (and never a not-found)", () => {
    const withMissing = [...rows, notFoundRow("d4", "law", "text")];
    const q: StructuredQuery = {
      match: "all",
      predicates: [{ kind: "text", attribute: "law", op: "not_equals", value: "California" }],
    };
    const r = runStructuredQuery(withMissing, q);
    expect(r.matchedDocumentIds).toEqual(["d2"]); // d4 not-found is excluded, not matched
    expect(r.caveats.excludedNotFound).toBe(1);
  });

  it("contains is a case-insensitive substring", () => {
    const q: StructuredQuery = {
      match: "all",
      predicates: [{ kind: "text", attribute: "law", op: "contains", value: "york" }],
    };
    expect(runStructuredQuery(rows, q).matchedDocumentIds).toEqual(["d2"]);
  });

  it("text_one_of matches any normalized value in the set", () => {
    const q: StructuredQuery = {
      match: "all",
      predicates: [{ kind: "text_one_of", attribute: "law", values: ["New York", "Delaware"] }],
    };
    expect(runStructuredQuery(rows, q).matchedDocumentIds).toEqual(["d2"]);
  });

  it("text_one_of with an empty effective set matches nothing", () => {
    const q: StructuredQuery = {
      match: "all",
      predicates: [{ kind: "text_one_of", attribute: "law", values: ["Texas"] }],
    };
    expect(runStructuredQuery(rows, q).matched).toBe(0);
  });
});

describe("runStructuredQuery — number predicates", () => {
  const rows = [
    numberRow("d1", "value", 100),
    numberRow("d2", "value", 250),
    numberRow("d3", "value", 500),
  ];

  it.each([
    ["equals", 250, ["d2"]],
    ["lt", 250, ["d1"]],
    ["lte", 250, ["d1", "d2"]],
    ["gt", 250, ["d3"]],
    ["gte", 250, ["d2", "d3"]],
  ] as const)("op %s", (op, value, expected) => {
    const q: StructuredQuery = {
      match: "all",
      predicates: [{ kind: "number", attribute: "value", op, value }],
    };
    expect(runStructuredQuery(rows, q).matchedDocumentIds).toEqual(expected);
  });

  it("between is inclusive on both ends", () => {
    const q: StructuredQuery = {
      match: "all",
      predicates: [{ kind: "number_between", attribute: "value", min: 100, max: 250 }],
    };
    expect(runStructuredQuery(rows, q).matchedDocumentIds).toEqual(["d1", "d2"]);
  });
});

describe("runStructuredQuery — date predicates (lexicographic ISO)", () => {
  const rows = [
    dateRow("d1", "signed", "2024-01-15"),
    dateRow("d2", "signed", "2025-06-01"),
    dateRow("d3", "signed", "2025-12-31"),
  ];

  it.each([
    ["before", "2025-06-01", ["d1"]],
    ["after", "2025-06-01", ["d3"]],
    ["on", "2025-06-01", ["d2"]],
  ] as const)("op %s", (op, value, expected) => {
    const q: StructuredQuery = {
      match: "all",
      predicates: [{ kind: "date", attribute: "signed", op, value }],
    };
    expect(runStructuredQuery(rows, q).matchedDocumentIds).toEqual(expected);
  });

  it("between is inclusive", () => {
    const q: StructuredQuery = {
      match: "all",
      predicates: [
        { kind: "date_between", attribute: "signed", min: "2025-01-01", max: "2025-12-31" },
      ],
    };
    expect(runStructuredQuery(rows, q).matchedDocumentIds).toEqual(["d2", "d3"]);
  });
});

describe("runStructuredQuery — boolean predicates", () => {
  const rows = [boolRow("d1", "renews", true), boolRow("d2", "renews", false), boolRow("d3", "renews", true)];

  it("matches true", () => {
    const q: StructuredQuery = {
      match: "all",
      predicates: [{ kind: "boolean", attribute: "renews", value: true }],
    };
    expect(runStructuredQuery(rows, q).matchedDocumentIds).toEqual(["d1", "d3"]);
  });

  it("matches false", () => {
    const q: StructuredQuery = {
      match: "all",
      predicates: [{ kind: "boolean", attribute: "renews", value: false }],
    };
    expect(runStructuredQuery(rows, q).matchedDocumentIds).toEqual(["d2"]);
  });
});

describe("runStructuredQuery — presence predicates (the honesty queries)", () => {
  const rows = [
    textRow("d1", "version", "3"),
    notFoundRow("d2", "version", "text"),
    textRow("d3", "version", "2", { citationVerified: false }),
  ];

  it("found matches documents with a found value", () => {
    const q: StructuredQuery = {
      match: "all",
      predicates: [{ kind: "presence", attribute: "version", state: "found" }],
    };
    expect(runStructuredQuery(rows, q).matchedDocumentIds).toEqual(["d1", "d3"]);
  });

  it("not_found counts the honest not-founds — and never an unextracted doc", () => {
    const withMissing = [...rows, textRow("d4", "other", "x")]; // d4 has no version row
    const q: StructuredQuery = {
      match: "all",
      predicates: [{ kind: "presence", attribute: "version", state: "not_found" }],
    };
    const r = runStructuredQuery(withMissing, q);
    expect(r.matchedDocumentIds).toEqual(["d2"]); // d4 (no row) is NOT claimed not-found
  });

  it("unverified matches found values whose citation could not be verified", () => {
    const q: StructuredQuery = {
      match: "all",
      predicates: [{ kind: "presence", attribute: "version", state: "unverified" }],
    };
    expect(runStructuredQuery(rows, q).matchedDocumentIds).toEqual(["d3"]);
  });
});

describe("runStructuredQuery — combinators", () => {
  const rows = [
    // d1: version 3, signed 2025
    textRow("d1", "version", "3"),
    dateRow("d1", "signed", "2025-03-01"),
    // d2: version 3, signed 2024
    textRow("d2", "version", "3"),
    dateRow("d2", "signed", "2024-03-01"),
    // d3: version 2, signed 2025
    textRow("d3", "version", "2"),
    dateRow("d3", "signed", "2025-09-01"),
  ];

  it("match all is AND", () => {
    const q: StructuredQuery = {
      match: "all",
      predicates: [
        { kind: "text", attribute: "version", op: "equals", value: "3" },
        { kind: "date", attribute: "signed", op: "after", value: "2025-01-01" },
      ],
    };
    expect(runStructuredQuery(rows, q).matchedDocumentIds).toEqual(["d1"]);
  });

  it("match any is OR", () => {
    const q: StructuredQuery = {
      match: "any",
      predicates: [
        { kind: "text", attribute: "version", op: "equals", value: "2" },
        { kind: "date", attribute: "signed", op: "before", value: "2025-01-01" },
      ],
    };
    expect(runStructuredQuery(rows, q).matchedDocumentIds).toEqual(["d2", "d3"]);
  });

  it("empty predicate list matches every document in scope", () => {
    const r = runStructuredQuery(rows, { match: "all", predicates: [] });
    expect(r.matched).toBe(3);
    expect(r.total).toBe(3);
    expect(r.caveats).toEqual(ZERO_CAVEATS);
  });
});

describe("runStructuredQuery — type-correct column selection", () => {
  it("a number predicate reads value_number, not value_text", () => {
    // A text attribute carrying "100" must NOT satisfy a numeric comparison.
    const rows = [
      numberRow("d1", "n", 100),
      textRow("d2", "n", "100", {}, "text"), // value_number is null here
    ];
    const q: StructuredQuery = {
      match: "all",
      predicates: [{ kind: "number", attribute: "n", op: "gte", value: 50 }],
    };
    const r = runStructuredQuery(rows, q);
    expect(r.matchedDocumentIds).toEqual(["d1"]);
    // d2 was found but had no numeric value to compare → honest unparsed exclusion.
    expect(r.caveats.excludedUnparsedValue).toBe(1);
  });
});

describe("runStructuredQuery — honest caveats", () => {
  it("surfaces matched-on-unverified-citation without dropping the value", () => {
    const rows = [
      textRow("d1", "version", "3"),
      textRow("d2", "version", "3", { citationVerified: false }),
    ];
    const q: StructuredQuery = {
      match: "all",
      predicates: [{ kind: "text", attribute: "version", op: "equals", value: "3" }],
    };
    const r = runStructuredQuery(rows, q);
    expect(r.matched).toBe(2); // the unverified value still counts
    expect(r.caveats.matchedOnUnverifiedCitation).toBe(1);
  });

  it("qualifies a not-found that came from a truncated read", () => {
    const rows = [
      textRow("d1", "version", "3"),
      notFoundRow("d2", "version", "text", { sourceReadIncomplete: true }),
      notFoundRow("d3", "version", "text"),
    ];
    const q: StructuredQuery = {
      match: "all",
      predicates: [{ kind: "text", attribute: "version", op: "equals", value: "3" }],
    };
    const r = runStructuredQuery(rows, q);
    expect(r.caveats.excludedNotFound).toBe(2);
    expect(r.caveats.excludedNotFoundTruncated).toBe(1);
  });

  it("surfaces matched-on-truncated-read", () => {
    const rows = [textRow("d1", "version", "3", { sourceReadIncomplete: true })];
    const q: StructuredQuery = {
      match: "all",
      predicates: [{ kind: "text", attribute: "version", op: "equals", value: "3" }],
    };
    expect(runStructuredQuery(rows, q).caveats.matchedOnTruncatedRead).toBe(1);
  });

  it("counts not-extracted documents separately from honest not-founds", () => {
    const rows = [
      textRow("d1", "version", "3"),
      notFoundRow("d2", "version", "text"),
      textRow("d3", "other", "x"), // d3 has no version row at all
    ];
    const q: StructuredQuery = {
      match: "all",
      predicates: [{ kind: "text", attribute: "version", op: "equals", value: "3" }],
    };
    const r = runStructuredQuery(rows, q);
    expect(r.matched).toBe(1);
    expect(r.caveats.excludedNotFound).toBe(1); // d2
    expect(r.caveats.notExtracted).toBe(1); // d3
  });
});

describe("runStructuredQuery — group-by", () => {
  const rows = [
    textRow("d1", "version", "3", {}, "enum"),
    textRow("d2", "version", "3", {}, "enum"),
    textRow("d3", "version", "2", {}, "enum"),
    textRow("d4", "version", "3", { citationVerified: false }, "enum"),
    notFoundRow("d5", "version", "enum"),
  ];

  it("buckets matched documents by value, including a not-found bucket", () => {
    const r = runStructuredQuery(rows, { match: "all", predicates: [], groupBy: "version" });
    expect(r.groupBy).toBe("version");
    expect(r.distinctValueCount).toBe(2); // "3" and "2"
    expect(r.groups).toEqual([
      { value: "3", found: true, count: 3, unverifiedCount: 1 },
      { value: "2", found: true, count: 1, unverifiedCount: 0 },
      { value: "", found: false, count: 1, unverifiedCount: 0 },
    ]);
  });

  it("groups numeric values by their canonical form (3 and 3.0 together)", () => {
    const numeric = [
      numberRow("d1", "n", 3),
      numberRow("d2", "n", 3.0),
      numberRow("d3", "n", 4),
    ];
    const r = runStructuredQuery(numeric, { match: "all", predicates: [], groupBy: "n" });
    expect(r.groups).toEqual([
      { value: "3", found: true, count: 2, unverifiedCount: 0 },
      { value: "4", found: true, count: 1, unverifiedCount: 0 },
    ]);
  });

  it("orders groups by count desc, then found-before-not-found, then value asc on ties", () => {
    const tie = [
      textRow("d1", "k", "beta"),
      textRow("d2", "k", "alpha"),
      notFoundRow("d3", "k", "text"),
    ];
    const r = runStructuredQuery(tie, { match: "all", predicates: [], groupBy: "k" });
    // all counts are 1: found buckets first, alpha before beta, then not-found last.
    expect(r.groups?.map((g) => [g.value, g.found])).toEqual([
      ["alpha", true],
      ["beta", true],
      ["", false],
    ]);
  });

  it("group-by null when not grouping", () => {
    const r = runStructuredQuery(rows, { match: "all", predicates: [] });
    expect(r.groupBy).toBeNull();
    expect(r.groups).toBeNull();
    expect(r.distinctValueCount).toBeNull();
  });
});

describe("runStructuredQuery — edges", () => {
  it("empty input is a zero result", () => {
    const r = runStructuredQuery([], { match: "all", predicates: [] });
    expect(r).toMatchObject({ total: 0, matched: 0, matchedDocumentIds: [] });
    expect(r.caveats).toEqual(ZERO_CAVEATS);
  });

  it("all-not-found matches nothing and counts every exclusion", () => {
    const rows = [notFoundRow("d1", "v", "text"), notFoundRow("d2", "v", "text")];
    const q: StructuredQuery = {
      match: "all",
      predicates: [{ kind: "text", attribute: "v", op: "equals", value: "x" }],
    };
    const r = runStructuredQuery(rows, q);
    expect(r.matched).toBe(0);
    expect(r.total).toBe(2);
    expect(r.caveats.excludedNotFound).toBe(2);
  });

  it("empty input with group-by yields empty buckets, not null", () => {
    const r = runStructuredQuery([], { match: "all", predicates: [], groupBy: "v" });
    expect(r.groups).toEqual([]);
    expect(r.distinctValueCount).toBe(0);
  });
});

describe("runStructuredQuery — determinism", () => {
  // A mixed dataset exercising matching, grouping, and every caveat.
  const base: ExtractedAttributeValue[] = [
    textRow("d1", "version", "3", {}, "enum"),
    numberRow("d1", "value", 500),
    textRow("d2", "version", "3", { citationVerified: false }, "enum"),
    numberRow("d2", "value", 100),
    textRow("d3", "version", "2", {}, "enum"),
    numberRow("d3", "value", 750, { sourceReadIncomplete: true }),
    notFoundRow("d4", "version", "enum", { sourceReadIncomplete: true }),
    notFoundRow("d4", "value", "number"),
    textRow("d5", "other", "x"), // d5 never extracted for version/value
  ];

  const query: StructuredQuery = {
    match: "any",
    predicates: [
      { kind: "text", attribute: "version", op: "equals", value: "3" },
      { kind: "number", attribute: "value", op: "gte", value: 700 },
    ],
    groupBy: "version",
  };

  // A fixed reversal + interleave — deterministic shuffle without Math.random.
  function shuffle<T>(items: readonly T[], seed: number): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = (i * 7 + seed * 13 + 5) % (i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  it("identical (rows, query) → byte-identical result regardless of row order", () => {
    const canonical = JSON.stringify(runStructuredQuery(base, query));
    for (let seed = 0; seed < 8; seed += 1) {
      const reordered = shuffle(base, seed);
      expect(JSON.stringify(runStructuredQuery(reordered, query))).toBe(canonical);
    }
  });

  it("duplicate (document, attribute) rows resolve identically regardless of order", () => {
    // Two conflicting rows for the same pair; a total sort makes last-wins stable.
    const dupA = textRow("d9", "version", "3", {}, "enum");
    const dupB = textRow("d9", "version", "2", {}, "enum");
    const q: StructuredQuery = { match: "all", predicates: [], groupBy: "version" };
    const forward = JSON.stringify(runStructuredQuery([dupA, dupB], q));
    const reversed = JSON.stringify(runStructuredQuery([dupB, dupA], q));
    expect(forward).toBe(reversed);
  });
});
