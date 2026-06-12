import { describe, expect, it } from "vitest";

import { composeResearchExportMarkdown } from "@/lib/knowledge/research/export-markdown";
import type {
  ResearchFindingView,
  ResearchRunView,
} from "@/lib/knowledge/research/shared";

/**
 * The exported memo's contract: the full honest record — question, scope
 * with real provenance, the answer, the basis, the verify-against-sources
 * line, citations as a link list, and the per-document findings (the
 * evidence) — with non-completed statuses stated plainly.
 */

function run(overrides: Partial<ResearchRunView> = {}): ResearchRunView {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    ownerUserId: "u1",
    question: "How many of our MSAs were signed without a DPA?",
    status: "completed",
    scope: [
      {
        id: "c1",
        name: "Commercial contracts",
        provenance: ["Google Drive / Legal / Contracts"],
      },
    ],
    documentsTotal: 3,
    documentsProcessed: 3,
    documentsFailed: 1,
    skippedUnsupported: 2,
    answer: "Two of the three MSAs reviewed were signed without a DPA.",
    citations: [
      {
        id: "d1",
        title: "Acme MSA",
        url: "https://drive.google.com/d/d1",
        domain: "drive.google.com",
      },
    ],
    basis: "Read 2 documents across Commercial contracts. 1 document could not be read.",
    failureReason: null,
    createdAt: "2026-06-11T12:00:00Z",
    ...overrides,
  };
}

function finding(
  overrides: Partial<ResearchFindingView> = {},
): ResearchFindingView {
  return {
    externalId: "d1",
    title: "Acme MSA",
    sourceUrl: "https://drive.google.com/d/d1",
    provenance: "Commercial contracts · Google Drive / Legal / Contracts",
    relevant: true,
    determination: "Signed without a DPA attached.",
    supportingExcerpt: "no data processing agreement",
    status: "ok",
    ...overrides,
  };
}

describe("composeResearchExportMarkdown", () => {
  it("carries the full record: question, scope provenance, answer, basis, review line, citations, findings", () => {
    const { markdown } = composeResearchExportMarkdown(run(), [
      finding(),
      finding({
        externalId: "d2",
        title: "Lost.pdf",
        status: "fetch_failed",
        relevant: null,
        determination: "This document could not be read from its repository.",
        supportingExcerpt: "",
      }),
    ]);
    expect(markdown).toContain("## Question");
    expect(markdown).toContain("How many of our MSAs were signed without a DPA?");
    expect(markdown).toContain("**Commercial contracts**");
    expect(markdown).toContain("Google Drive / Legal / Contracts");
    expect(markdown).toContain("## Answer");
    expect(markdown).toContain("Read 2 documents across Commercial contracts.");
    expect(markdown).toContain("verify against the cited sources");
    expect(markdown).toContain("1. [Acme MSA](https://drive.google.com/d/d1) · drive.google.com");
    expect(markdown).toContain("## Findings");
    expect(markdown).toContain("**Acme MSA** · Relevant");
    expect(markdown).toContain("Signed without a DPA attached.");
    expect(markdown).toContain('*"no data processing agreement"*');
    expect(markdown).toContain("**Lost.pdf** · Could not be read");
    expect(markdown).toContain("Ran on June 11, 2026.");
  });

  it("states a cancelled run's status plainly and exports what exists", () => {
    const { markdown } = composeResearchExportMarkdown(
      run({ status: "cancelled", answer: null, citations: [], basis: null }),
      [finding()],
    );
    expect(markdown).toContain("**This run was cancelled.**");
    expect(markdown).not.toContain("## Answer");
    expect(markdown).toContain("## Findings");
  });

  it("states a failed run's status with its reason", () => {
    const { markdown } = composeResearchExportMarkdown(
      run({
        status: "failed",
        answer: null,
        failureReason: "A repository connection became unavailable mid-run.",
      }),
      [],
    );
    expect(markdown).toContain("**This run stopped before completing.**");
    expect(markdown).toContain("A repository connection became unavailable mid-run.");
  });

  it("builds a filesystem-safe filename base from the question", () => {
    const { filenameBase } = composeResearchExportMarkdown(
      run({ question: 'Which "MSAs"\\ / auto:renew?' }),
      [],
    );
    expect(filenameBase.startsWith("Research - ")).toBe(true);
    expect(filenameBase).not.toMatch(/[\\/:*?"<>|]/);
    expect(filenameBase.length).toBeLessThanOrEqual(80);
  });
});
