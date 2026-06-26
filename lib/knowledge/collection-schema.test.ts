import { describe, expect, it } from "vitest";

import type { CollectionAttribute } from "@/lib/knowledge/collection-schema";
import {
  collectionAttributesSchema,
  makeUniqueAttributeKey,
  MAX_COLLECTION_ATTRIBUTES,
  parseCollectionAttributes,
  slugifyAttributeKey,
} from "@/lib/knowledge/collection-schema";

/**
 * The schema-definition contract: keys are derived from labels deterministically
 * and kept unique, and the attributes array validates exactly the rules the
 * write boundary depends on (stable keys, valid types, non-empty descriptions,
 * no duplicate keys, bounded count, enum options well-formed).
 */

function attr(over: Partial<CollectionAttribute> = {}): CollectionAttribute {
  return {
    key: "version",
    label: "Version",
    type: "text",
    description: "The contract version number.",
    ...over,
  };
}

describe("slugifyAttributeKey", () => {
  it("lowercases and underscores a label", () => {
    expect(slugifyAttributeKey("Effective Date")).toBe("effective_date");
  });

  it("collapses punctuation runs and trims edge underscores", () => {
    expect(slugifyAttributeKey("  Counterparty / Vendor!  ")).toBe("counterparty_vendor");
  });

  it("forces a leading letter by dropping leading digits", () => {
    expect(slugifyAttributeKey("3rd amendment")).toBe("rd_amendment");
  });

  it("falls back to 'attribute' when nothing usable remains", () => {
    expect(slugifyAttributeKey("123")).toBe("attribute");
    expect(slugifyAttributeKey("")).toBe("attribute");
  });
});

describe("makeUniqueAttributeKey", () => {
  it("returns the bare slug when free", () => {
    expect(makeUniqueAttributeKey("Effective Date", [])).toBe("effective_date");
  });

  it("appends an incrementing suffix on collision", () => {
    expect(makeUniqueAttributeKey("Version", ["version"])).toBe("version_2");
    expect(makeUniqueAttributeKey("Version", ["version", "version_2"])).toBe("version_3");
  });
});

describe("collectionAttributesSchema", () => {
  it("accepts a valid set", () => {
    const result = collectionAttributesSchema.safeParse([
      attr(),
      attr({ key: "effective_date", label: "Effective date", type: "date", description: "When it takes effect." }),
      attr({
        key: "agreement_type",
        label: "Agreement type",
        type: "enum",
        description: "The kind of agreement.",
        options: ["NDA", "MSA", "SOW"],
      }),
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects a duplicate key", () => {
    const result = collectionAttributesSchema.safeParse([attr(), attr()]);
    expect(result.success).toBe(false);
  });

  it("rejects an empty description", () => {
    const result = collectionAttributesSchema.safeParse([attr({ description: "  " })]);
    expect(result.success).toBe(false);
  });

  it("rejects an enum with no options", () => {
    const result = collectionAttributesSchema.safeParse([
      attr({ key: "t", label: "Type", type: "enum", description: "Kind.", options: [] }),
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects options on a non-enum attribute", () => {
    const result = collectionAttributesSchema.safeParse([
      attr({ type: "text", options: ["a", "b"] }),
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects duplicate enum options", () => {
    const result = collectionAttributesSchema.safeParse([
      attr({ key: "t", label: "Type", type: "enum", description: "Kind.", options: ["NDA", "NDA"] }),
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects an unknown type", () => {
    const result = collectionAttributesSchema.safeParse([{ ...attr(), type: "currency" }]);
    expect(result.success).toBe(false);
  });

  it("rejects more than the maximum attribute count", () => {
    const many = Array.from({ length: MAX_COLLECTION_ATTRIBUTES + 1 }, (_, i) =>
      attr({ key: `a_${i}`, label: `A ${i}` }),
    );
    expect(collectionAttributesSchema.safeParse(many).success).toBe(false);
  });
});

describe("parseCollectionAttributes", () => {
  it("returns parsed attributes for valid jsonb", () => {
    const parsed = parseCollectionAttributes([attr()]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.key).toBe("version");
  });

  it("degrades malformed input to an empty list", () => {
    expect(parseCollectionAttributes(null)).toEqual([]);
    expect(parseCollectionAttributes([{ nope: true }])).toEqual([]);
    expect(parseCollectionAttributes("not an array")).toEqual([]);
  });
});
