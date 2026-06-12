import { describe, expect, it } from "vitest";

import type { SegmentFinding } from "@/lib/knowledge/research/engine-core";
import {
  composeInlineFindingsResult,
  composeNoCollectionsResult,
  composeOverCapResult,
  composeUnknownCollectionsResult,
  RESEARCH_INLINE_DOCUMENT_CAP,
  RESEARCH_SURFACE_PATH,
  resolveRequestedCollections,
} from "@/lib/knowledge/research/inline-result";

/**
 * The inline research tool's pure contract: scope-name resolution against
 * the user's visible collections, the cap gate's honest handoff, and the
 * result texts the model relays.
 */

const VISIBLE = [
  { id: "a", name: "Commercial contracts" },
  { id: "b", name: "Playbooks" },
];

describe("resolveRequestedCollections", () => {
  it("defaults to all visible collections when none are requested", () => {
    expect(resolveRequestedCollections(undefined, VISIBLE).matched).toEqual(VISIBLE);
    expect(resolveRequestedCollections([], VISIBLE).matched).toEqual(VISIBLE);
  });

  it("matches case-insensitively and reports unknown names", () => {
    const { matched, unknown } = resolveRequestedCollections(
      ["commercial CONTRACTS", "Litigation files"],
      VISIBLE,
    );
    expect(matched.map((c) => c.id)).toEqual(["a"]);
    expect(unknown).toEqual(["Litigation files"]);
  });

  it("never matches outside the visible set (the permission boundary)", () => {
    const { matched, unknown } = resolveRequestedCollections(
      ["Hidden collection"],
      VISIBLE,
    );
    expect(matched).toEqual([]);
    expect(unknown).toEqual(["Hidden collection"]);
  });
});

describe("the honest non-answer results", () => {
  it("over-cap states the count, the cap, and the Research surface handoff", () => {
    const text = composeOverCapResult(487, ["Commercial contracts"]);
    expect(text).toContain("487 documents");
    expect(text).toContain(String(RESEARCH_INLINE_DOCUMENT_CAP));
    expect(text).toContain(RESEARCH_SURFACE_PATH);
    expect(text).toContain("Tell the user");
  });

  it("no-collections is plain guidance, not an error", () => {
    const text = composeNoCollectionsResult();
    expect(text).toContain("No document collections are visible");
    expect(text.toLowerCase()).not.toContain("error");
  });

  it("unknown names list what IS available", () => {
    const text = composeUnknownCollectionsResult(
      ["Litigation files"],
      ["Commercial contracts", "Playbooks"],
    );
    expect(text).toContain('"Litigation files"');
    expect(text).toContain("Commercial contracts, Playbooks");
  });
});

describe("composeInlineFindingsResult", () => {
  const finding = (overrides: Partial<SegmentFinding>): SegmentFinding => ({
    externalId: "d1",
    title: "Acme MSA",
    sourceUrl: "https://drive.google.com/d/d1",
    provenance: "Commercial contracts · Google Drive / Legal",
    relevant: true,
    determination: "Auto-renews annually.",
    supportingExcerpt: "renews automatically",
    status: "ok",
    ...overrides,
  });

  it("carries the basis, every determination, and the cite-by-title instruction", () => {
    const text = composeInlineFindingsResult(
      "Which of our vendor agreements auto-renew?",
      [
        finding({}),
        finding({
          externalId: "d2",
          title: "Lost.pdf",
          status: "fetch_failed",
          relevant: null,
          determination: "This document could not be read from its repository.",
          supportingExcerpt: "",
        }),
      ],
      "Read 1 document across Commercial contracts. 1 document could not be read.",
    );
    expect(text).toContain("Basis: Read 1 document");
    expect(text).toContain('"Acme MSA" (relevant): Auto-renews annually.');
    expect(text).toContain('Excerpt: "renews automatically"');
    expect(text).toContain('"Lost.pdf" (could not be read)');
    expect(text).toContain("do not invent documents");
    expect(text).toContain("citations");
  });
});
