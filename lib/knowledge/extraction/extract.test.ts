import { describe, expect, it } from "vitest";

import type { CollectionAttribute } from "@/lib/knowledge/collection-schema";
import {
  coerceAttributeValue,
  composePreparationBasis,
  deriveCollectionPreparationState,
  isPairStale,
  parseExtractionOutput,
  selectStaleExtractionWork,
  verifyCitation,
  type ExistingExtraction,
  type ExtractionDocumentRef,
} from "@/lib/knowledge/extraction/extract";

/**
 * The extraction engine's pure parts: derived staleness and work selection (the
 * reconcile foundation), the per-type value coercion that makes a value
 * queryable, the citation substring verification (the credibility upgrade), the
 * defensive output parse, the preparation-state derivation, and the honest basis
 * line. No network; the reconcile contract is pinned here.
 */

const SCHEMA_ID = "schema-1";
const OTHER_SCHEMA_ID = "schema-2";

function doc(
  documentId: string,
  modifiedAtSource: string | null,
): ExtractionDocumentRef {
  return {
    documentId,
    externalId: `ext-${documentId}`,
    title: `Doc ${documentId}`,
    connectionId: "conn-1",
    sourceUrl: null,
    modifiedAtSource,
  };
}

function attr(
  key: string,
  type: CollectionAttribute["type"] = "text",
): CollectionAttribute {
  return { key, label: key, type, description: `the ${key}` };
}

describe("isPairStale", () => {
  const base = { schemaId: SCHEMA_ID, schemaVersion: 2 };

  it("is stale when never extracted", () => {
    expect(
      isPairStale({ ...base, documentModifiedAtSource: null, existing: undefined }),
    ).toBe(true);
  });

  it("is stale when the document changed since extraction", () => {
    const existing: ExistingExtraction = {
      documentId: "d1",
      attributeKey: "k",
      documentModifiedAtSource: "2026-01-01T00:00:00Z",
      extractedAgainstSchemaVersion: 2,
      sourceCollectionSchemaId: SCHEMA_ID,
    };
    expect(
      isPairStale({
        ...base,
        documentModifiedAtSource: "2026-02-01T00:00:00Z",
        existing,
      }),
    ).toBe(true);
  });

  it("is stale when this collection's own schema advanced", () => {
    const existing: ExistingExtraction = {
      documentId: "d1",
      attributeKey: "k",
      documentModifiedAtSource: "2026-01-01T00:00:00Z",
      extractedAgainstSchemaVersion: 1,
      sourceCollectionSchemaId: SCHEMA_ID,
    };
    expect(
      isPairStale({
        ...base,
        documentModifiedAtSource: "2026-01-01T00:00:00Z",
        existing,
      }),
    ).toBe(true);
  });

  it("reuses a row produced by another collection's schema (extract once)", () => {
    const existing: ExistingExtraction = {
      documentId: "d1",
      attributeKey: "k",
      documentModifiedAtSource: "2026-01-01T00:00:00Z",
      extractedAgainstSchemaVersion: 1, // older version, but a DIFFERENT schema
      sourceCollectionSchemaId: OTHER_SCHEMA_ID,
    };
    expect(
      isPairStale({
        ...base,
        documentModifiedAtSource: "2026-01-01T00:00:00Z",
        existing,
      }),
    ).toBe(false);
  });

  it("is current when unchanged and at the same version", () => {
    const existing: ExistingExtraction = {
      documentId: "d1",
      attributeKey: "k",
      documentModifiedAtSource: "2026-01-01T00:00:00Z",
      extractedAgainstSchemaVersion: 2,
      sourceCollectionSchemaId: SCHEMA_ID,
    };
    expect(
      isPairStale({
        ...base,
        documentModifiedAtSource: "2026-01-01T00:00:00Z",
        existing,
      }),
    ).toBe(false);
  });
});

describe("selectStaleExtractionWork", () => {
  it("returns only stale pairs, each document carrying just its stale attributes", () => {
    const documents = [
      doc("d1", "2026-01-01T00:00:00Z"),
      doc("d2", "2026-01-01T00:00:00Z"),
    ];
    const attributes = [attr("a"), attr("b")];
    const existing: ExistingExtraction[] = [
      // d1/a current; d1/b never extracted; d2 fully current.
      {
        documentId: "d1",
        attributeKey: "a",
        documentModifiedAtSource: "2026-01-01T00:00:00Z",
        extractedAgainstSchemaVersion: 1,
        sourceCollectionSchemaId: SCHEMA_ID,
      },
      {
        documentId: "d2",
        attributeKey: "a",
        documentModifiedAtSource: "2026-01-01T00:00:00Z",
        extractedAgainstSchemaVersion: 1,
        sourceCollectionSchemaId: SCHEMA_ID,
      },
      {
        documentId: "d2",
        attributeKey: "b",
        documentModifiedAtSource: "2026-01-01T00:00:00Z",
        extractedAgainstSchemaVersion: 1,
        sourceCollectionSchemaId: SCHEMA_ID,
      },
    ];
    const work = selectStaleExtractionWork(
      documents,
      attributes,
      SCHEMA_ID,
      1,
      existing,
    );
    expect(work).toHaveLength(1);
    expect(work[0].document.documentId).toBe("d1");
    expect(work[0].attributeKeys).toEqual(["b"]);
  });

  it("marks every pair stale when nothing was ever extracted", () => {
    const documents = [doc("d1", null), doc("d2", null)];
    const work = selectStaleExtractionWork(
      documents,
      [attr("a"), attr("b")],
      SCHEMA_ID,
      1,
      [],
    );
    expect(work).toHaveLength(2);
    expect(work[0].attributeKeys).toEqual(["a", "b"]);
  });
});

describe("deriveCollectionPreparationState", () => {
  const work = [{ document: doc("d1", null), attributeKeys: ["a"] }];
  it("no_schema when there are no attributes", () => {
    expect(
      deriveCollectionPreparationState({
        documentCount: 3,
        attributeCount: 0,
        staleWork: [],
        existingCount: 0,
      }),
    ).toBe("no_schema");
  });
  it("no_documents when a schema exists but no documents", () => {
    expect(
      deriveCollectionPreparationState({
        documentCount: 0,
        attributeCount: 2,
        staleWork: [],
        existingCount: 0,
      }),
    ).toBe("no_documents");
  });
  it("not_prepared when stale and nothing ever extracted", () => {
    expect(
      deriveCollectionPreparationState({
        documentCount: 1,
        attributeCount: 1,
        staleWork: work,
        existingCount: 0,
      }),
    ).toBe("not_prepared");
  });
  it("needs_updating when stale but some extraction exists", () => {
    expect(
      deriveCollectionPreparationState({
        documentCount: 1,
        attributeCount: 1,
        staleWork: work,
        existingCount: 5,
      }),
    ).toBe("needs_updating");
  });
  it("ready when nothing is stale", () => {
    expect(
      deriveCollectionPreparationState({
        documentCount: 1,
        attributeCount: 1,
        staleWork: [],
        existingCount: 5,
      }),
    ).toBe("ready");
  });
});

describe("coerceAttributeValue", () => {
  it("parses a number, stripping currency and separators", () => {
    expect(coerceAttributeValue("number", "$1,250,000.50")).toMatchObject({
      valueNumber: 1250000.5,
      typedParseFailed: false,
    });
  });
  it("flags an unparseable number but keeps the text", () => {
    const c = coerceAttributeValue("number", "about a million");
    expect(c.valueNumber).toBeNull();
    expect(c.typedParseFailed).toBe(true);
    // The point: the human-readable value is preserved regardless.
    expect(c.valueText).toBe("about a million");
  });
  it("parses a date to an ISO calendar date", () => {
    expect(coerceAttributeValue("date", "January 5, 2026")).toMatchObject({
      valueDate: "2026-01-05",
      typedParseFailed: false,
    });
  });
  it("flags an unparseable date", () => {
    const c = coerceAttributeValue("date", "sometime next quarter");
    expect(c.valueDate).toBeNull();
    expect(c.typedParseFailed).toBe(true);
    expect(c.valueText).toBe("sometime next quarter");
  });
  it("parses booleans from yes/no", () => {
    expect(coerceAttributeValue("boolean", "Yes").valueBoolean).toBe(true);
    expect(coerceAttributeValue("boolean", "no").valueBoolean).toBe(false);
  });
  it("stores enum and text in value_text only", () => {
    const e = coerceAttributeValue("enum", "NDA");
    expect(e).toMatchObject({
      valueText: "NDA",
      valueNumber: null,
      valueDate: null,
      valueBoolean: null,
    });
  });
  it("coerces blank to empty", () => {
    expect(coerceAttributeValue("text", "   ").valueText).toBeNull();
  });
});

describe("verifyCitation", () => {
  const source = "The Governing Law of this Agreement is the State of Delaware.";
  it("verifies an exact substring", () => {
    expect(verifyCitation(source, "State of Delaware")).toBe(true);
  });
  it("verifies across reflowed whitespace", () => {
    expect(verifyCitation(source, "Governing Law\n   of this")).toBe(true);
  });
  it("rejects a quote not in the source", () => {
    expect(verifyCitation(source, "State of New York")).toBe(false);
  });
  it("rejects an empty quote", () => {
    expect(verifyCitation(source, "")).toBe(false);
  });
});

describe("parseExtractionOutput", () => {
  it("parses a well-formed object, one result per expected key", () => {
    const text = JSON.stringify({
      attributes: {
        governing_law: { found: true, value: "Delaware", excerpt: "State of Delaware" },
        auto_renews: { found: false, value: null, excerpt: "" },
      },
    });
    const out = parseExtractionOutput(text, ["governing_law", "auto_renews"]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ attributeKey: "governing_law", found: true, value: "Delaware" });
    expect(out[1]).toMatchObject({ attributeKey: "auto_renews", found: false, value: null });
  });
  it("degrades an omitted key to honest not-found", () => {
    const text = JSON.stringify({ attributes: { governing_law: { found: true, value: "X", excerpt: "X" } } });
    const out = parseExtractionOutput(text, ["governing_law", "term_length"]);
    expect(out[1]).toMatchObject({ attributeKey: "term_length", found: false, value: null });
  });
  it("treats found-with-no-value as not-found", () => {
    const text = JSON.stringify({ attributes: { k: { found: true, value: "", excerpt: "q" } } });
    expect(parseExtractionOutput(text, ["k"])[0]).toMatchObject({ found: false, value: null });
  });
  it("returns all-not-found on malformed output", () => {
    const out = parseExtractionOutput("not json at all", ["a", "b"]);
    expect(out.every((r) => r.found === false)).toBe(true);
    expect(out).toHaveLength(2);
  });
});

describe("composePreparationBasis", () => {
  it("states what was prepared and the honest qualifiers", () => {
    const line = composePreparationBasis(
      {
        documentsPrepared: 47,
        documentsUnreadable: 3,
        attributesFound: 120,
        attributesNotFound: 30,
        attributesUnverified: 4,
        attributesReadIncomplete: 2,
      },
      50,
    );
    expect(line).toContain("Prepared 47 of 50 documents.");
    expect(line).toContain("3 documents could not be read.");
    expect(line).toContain("120 values found, 30 not found.");
    expect(line).toContain("4 values could not be verified against the source.");
    expect(line).toContain("2 values were read from a document longer than could be fully scanned.");
  });
  it("omits qualifiers that are zero", () => {
    const line = composePreparationBasis(
      {
        documentsPrepared: 1,
        documentsUnreadable: 0,
        attributesFound: 2,
        attributesNotFound: 0,
        attributesUnverified: 0,
        attributesReadIncomplete: 0,
      },
      1,
    );
    expect(line).toBe("Prepared 1 of 1 document. 2 values found, 0 not found.");
  });
});
