import { describe, expect, it } from "vitest";

import type { CollectionAttribute } from "@/lib/knowledge/collection-schema";
import type {
  ExtractionDocumentRef,
  RawExtractedAttribute,
  StaleWorkItem,
} from "@/lib/knowledge/extraction/extract";
import { processExtractionSegment } from "@/lib/knowledge/extraction/engine-core";

/**
 * The extraction segment core's no-silent-drop guarantees: an unreadable
 * document yields no rows and is reported (so it stays stale and is retried);
 * every readable document's stale attributes yield exactly one row each;
 * citations are verified against the source in hand; a truncated read flags
 * read-incomplete; a model that omits a key degrades to honest not-found.
 */

const attributes: CollectionAttribute[] = [
  { key: "governing_law", label: "Governing law", type: "text", description: "the governing law" },
  { key: "value", label: "Value", type: "number", description: "the contract value" },
];

function workItem(
  documentId: string,
  attributeKeys: string[] = ["governing_law", "value"],
): StaleWorkItem {
  const document: ExtractionDocumentRef = {
    documentId,
    externalId: `ext-${documentId}`,
    title: `Doc ${documentId}`,
    connectionId: "conn-1",
    sourceUrl: null,
    modifiedAtSource: "2026-01-01T00:00:00Z",
  };
  return { document, attributeKeys };
}

describe("processExtractionSegment", () => {
  it("reports an unreadable document and emits no rows for it", async () => {
    const outcome = await processExtractionSegment([workItem("d1")], attributes, {
      readDocument: async () => null,
      extract: async () => {
        throw new Error("should not extract an unreadable document");
      },
    });
    expect(outcome.rows).toHaveLength(0);
    expect(outcome.unreadableDocumentIds).toEqual(["d1"]);
    expect(outcome.tally.documentsUnreadable).toBe(1);
    expect(outcome.tally.documentsPrepared).toBe(0);
  });

  it("emits one verified row per found attribute and coerces typed values", async () => {
    const source =
      "Governing Law: Delaware. Total contract value: $2,000,000.";
    const outcome = await processExtractionSegment([workItem("d1")], attributes, {
      readDocument: async () => ({ text: source, truncated: false }),
      extract: async (_doc, keys): Promise<RawExtractedAttribute[]> =>
        keys.map((key) =>
          key === "governing_law"
            ? { attributeKey: key, found: true, value: "Delaware", excerpt: "Governing Law: Delaware" }
            : { attributeKey: key, found: true, value: "$2,000,000", excerpt: "value: $2,000,000" },
        ),
    });
    expect(outcome.rows).toHaveLength(2);
    const law = outcome.rows.find((r) => r.attributeKey === "governing_law")!;
    expect(law).toMatchObject({ found: true, valueText: "Delaware", citationVerified: true });
    const value = outcome.rows.find((r) => r.attributeKey === "value")!;
    expect(value).toMatchObject({ found: true, valueNumber: 2000000, citationVerified: true });
    expect(outcome.tally).toMatchObject({
      documentsPrepared: 1,
      attributesFound: 2,
      attributesUnverified: 0,
    });
  });

  it("flags a found value whose quote is not in the source as unverified", async () => {
    const outcome = await processExtractionSegment([workItem("d1", ["governing_law"])], attributes, {
      readDocument: async () => ({ text: "Some unrelated contract text.", truncated: false }),
      extract: async () => [
        { attributeKey: "governing_law", found: true, value: "Delaware", excerpt: "Governing Law: Delaware" },
      ],
    });
    expect(outcome.rows[0]).toMatchObject({ found: true, citationVerified: false });
    expect(outcome.tally.attributesUnverified).toBe(1);
  });

  it("records honest not-found and flags read-incomplete on a truncated read", async () => {
    const outcome = await processExtractionSegment([workItem("d1", ["governing_law"])], attributes, {
      readDocument: async () => ({ text: "Truncated head of a long doc.", truncated: true }),
      extract: async () => [
        { attributeKey: "governing_law", found: false, value: null, excerpt: "" },
      ],
    });
    expect(outcome.rows[0]).toMatchObject({
      found: false,
      sourceReadIncomplete: true,
      citationVerified: false,
    });
    expect(outcome.tally.attributesNotFound).toBe(1);
    expect(outcome.tally.attributesReadIncomplete).toBe(1);
  });

  it("degrades a model-omitted attribute to not-found", async () => {
    const outcome = await processExtractionSegment([workItem("d1")], attributes, {
      readDocument: async () => ({ text: "Governing Law: Delaware.", truncated: false }),
      // The model returns only one of the two requested keys.
      extract: async () => [
        { attributeKey: "governing_law", found: true, value: "Delaware", excerpt: "Governing Law: Delaware" },
      ],
    });
    const value = outcome.rows.find((r) => r.attributeKey === "value")!;
    expect(value).toMatchObject({ found: false, valueText: null });
    expect(outcome.tally.attributesFound).toBe(1);
    expect(outcome.tally.attributesNotFound).toBe(1);
  });
});
