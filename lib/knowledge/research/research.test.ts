import { describe, expect, it } from "vitest";

import { buildCitations, composeBasisLine } from "@/lib/knowledge/research/basis";
import {
  batchForClassification,
  buildClassifySystemPrompt,
  buildClassifyUserPrompt,
  CLASSIFY_MAX_CHARS_PER_CALL,
  CLASSIFY_MAX_DOCS_PER_CALL,
  parseClassifierOutput,
} from "@/lib/knowledge/research/classify";
import { processResearchSegment } from "@/lib/knowledge/research/engine-core";
import {
  classifyResearchFailure,
  docCapExceededMessage,
  estimateResearchPreview,
  isReadableMimeType,
  RESEARCH_ENUMERATION_MESSAGE,
  type ResearchDocumentRef,
} from "@/lib/knowledge/research/shared";

/**
 * The research engine's pure parts: the preview math the scope picker shows,
 * the classification batching/parsing contract, the honest basis line and
 * code-built citations, and the segment core's no-silent-drop guarantees
 * (every input document yields exactly one finding, failures included).
 */

describe("estimateResearchPreview", () => {
  it("produces an honest minute range and never zero, no money", () => {
    const preview = estimateResearchPreview(200, 200);
    expect(preview.documentCount).toBe(200);
    expect(preview.estMinutesLow).toBeGreaterThanOrEqual(1);
    expect(preview.estMinutesHigh).toBeGreaterThan(preview.estMinutesLow);
    expect(preview.overCap).toBe(false);
    // Money is never computed or shown to the user anymore.
    expect(preview).not.toHaveProperty("estCostLowUsd");
    expect(preview).not.toHaveProperty("estCostHighUsd");
  });

  it("flags over-cap scopes instead of silently truncating", () => {
    const preview = estimateResearchPreview(487, 200);
    expect(preview.overCap).toBe(true);
    expect(preview.cap).toBe(200);
  });
});

describe("over-limit messages and classification", () => {
  it("states the exact count and the workspace limit in the doc-cap message", () => {
    const message = docCapExceededMessage(487, 200);
    expect(message).toContain("487 documents");
    expect(message).toContain("limit of 200");
    expect(message).toContain("Policy & access");
  });

  it("classifies each failure to its distinct kind, never conflated", () => {
    expect(classifyResearchFailure(docCapExceededMessage(487, 200))).toBe(
      "doc_cap",
    );
    expect(classifyResearchFailure(RESEARCH_ENUMERATION_MESSAGE)).toBe(
      "enumeration",
    );
    expect(classifyResearchFailure("A connection became unavailable.")).toBe(
      "other",
    );
    expect(classifyResearchFailure(null)).toBe("other");
  });

  it("keeps the enumeration message free of a number or an admin lever", () => {
    expect(RESEARCH_ENUMERATION_MESSAGE).not.toMatch(/\d/);
    expect(RESEARCH_ENUMERATION_MESSAGE.toLowerCase()).not.toContain("admin");
  });
});

describe("isReadableMimeType", () => {
  it("accepts the office/PDF/text family the read tools support", () => {
    expect(isReadableMimeType("application/pdf")).toBe(true);
    expect(isReadableMimeType("application/vnd.google-apps.document")).toBe(true);
    expect(isReadableMimeType("text/plain")).toBe(true);
  });
  it("rejects folders, images, and unknown types", () => {
    expect(isReadableMimeType("application/vnd.google-apps.folder")).toBe(false);
    expect(isReadableMimeType("image/png")).toBe(false);
    expect(isReadableMimeType("")).toBe(false);
  });
});

describe("batchForClassification", () => {
  const doc = (id: string, size: number) => ({
    externalId: id,
    title: id,
    content: "x".repeat(size),
  });

  it("caps the documents per call", () => {
    const docs = Array.from({ length: 14 }, (_, i) => doc(`d${i}`, 10));
    const batches = batchForClassification(docs);
    expect(batches.map((b) => b.length)).toEqual([
      CLASSIFY_MAX_DOCS_PER_CALL,
      CLASSIFY_MAX_DOCS_PER_CALL,
      14 - 2 * CLASSIFY_MAX_DOCS_PER_CALL,
    ]);
  });

  it("caps the characters per call, and an oversize doc still ships alone", () => {
    const big = doc("big", CLASSIFY_MAX_CHARS_PER_CALL + 1_000);
    const small = doc("small", 10);
    const batches = batchForClassification([small, big, small]);
    expect(batches[0].map((d) => d.externalId)).toEqual(["small"]);
    expect(batches[1].map((d) => d.externalId)).toEqual(["big"]);
  });
});

describe("parseClassifierOutput", () => {
  it("parses the JSON array, keeping only expected ids and first occurrences", () => {
    const text = `Here you go:\n[{"id":"a","relevant":true,"determination":"Has the clause.","excerpt":"…liability is limited…"},{"id":"a","relevant":false,"determination":"dupe"},{"id":"zzz","relevant":true,"determination":"forged"}]`;
    const findings = parseClassifierOutput(text, ["a", "b"]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      externalId: "a",
      relevant: true,
      determination: "Has the clause.",
    });
  });

  it("returns [] on malformed output rather than inventing determinations", () => {
    expect(parseClassifierOutput("no json here", ["a"])).toEqual([]);
    expect(parseClassifierOutput("[{broken", ["a"])).toEqual([]);
  });
});

describe("prompt builders", () => {
  it("embeds the rubric as data and the documents in id-tagged blocks", () => {
    expect(buildClassifySystemPrompt("RUBRIC-X")).toContain("RUBRIC-X");
    const user = buildClassifyUserPrompt([
      { externalId: "d1", title: "MSA", content: "body" },
    ]);
    expect(user).toContain('<document id="d1"');
    expect(user).toContain("body");
  });
});

describe("composeBasisLine", () => {
  it("states the read count and every failure class, nothing silent", () => {
    const line = composeBasisLine({
      documentsRead: 47,
      fetchFailed: 3,
      readIncomplete: 2,
      skippedUnsupported: 5,
      collectionNames: ["Commercial contracts"],
    });
    expect(line).toContain("Read 47 documents across Commercial contracts.");
    expect(line).toContain("3 documents could not be read.");
    expect(line).toContain("2 documents were only partially readable.");
    expect(line).toContain("5 files of unsupported types were not read.");
  });

  it("stays minimal when everything read cleanly", () => {
    const line = composeBasisLine({
      documentsRead: 10,
      fetchFailed: 0,
      readIncomplete: 0,
      skippedUnsupported: 0,
      collectionNames: ["Playbooks", "Policies"],
    });
    expect(line).toBe("Read 10 documents across Playbooks, Policies.");
  });
});

describe("buildCitations", () => {
  it("cites only relevant, readable findings with parseable links", () => {
    const citations = buildCitations([
      { externalId: "a", title: "MSA", sourceUrl: "https://drive.google.com/d/a", relevant: true, status: "ok" },
      { externalId: "b", title: "NDA", sourceUrl: "https://drive.google.com/d/b", relevant: false, status: "ok" },
      { externalId: "c", title: "Lost", sourceUrl: "https://drive.google.com/d/c", relevant: true, status: "fetch_failed" },
      { externalId: "d", title: "No link", sourceUrl: null, relevant: true, status: "ok" },
      { externalId: "e", title: "Bad link", sourceUrl: "not a url", relevant: true, status: "ok" },
    ]);
    expect(citations).toEqual([
      { id: "a", title: "MSA", url: "https://drive.google.com/d/a", domain: "drive.google.com" },
    ]);
  });
});

describe("processResearchSegment", () => {
  const ref = (id: string): ResearchDocumentRef => ({
    externalId: id,
    title: `${id}.pdf`,
    mimeType: "application/pdf",
    sourceUrl: `https://example.com/${id}`,
    connectionId: "conn",
    serverId: "google-drive-mcp",
    provenance: "Contracts · Google Drive / Legal",
  });

  it("yields one finding per document: ok, truncated, and unreadable alike", async () => {
    const findings = await processResearchSegment(
      [ref("ok"), ref("trunc"), ref("dead")],
      {
        readDocument: async (doc) =>
          doc.externalId === "dead"
            ? null
            : { text: "contract text", truncated: doc.externalId === "trunc" },
        classify: async (batch) =>
          batch.map((d) => ({
            externalId: d.externalId,
            relevant: true,
            determination: "Contains the clause.",
            excerpt: "the clause",
          })),
      },
    );
    expect(findings).toHaveLength(3);
    expect(findings[0]).toMatchObject({ externalId: "ok", status: "ok", relevant: true });
    expect(findings[1]).toMatchObject({ externalId: "trunc", status: "read_incomplete", relevant: true });
    expect(findings[2]).toMatchObject({
      externalId: "dead",
      status: "fetch_failed",
      relevant: null,
    });
  });

  it("records an honest no-determination finding when the classifier omits a document", async () => {
    const findings = await processResearchSegment([ref("a"), ref("b")], {
      readDocument: async () => ({ text: "text", truncated: false }),
      classify: async (batch) =>
        batch
          .filter((d) => d.externalId === "a")
          .map((d) => ({
            externalId: d.externalId,
            relevant: false,
            determination: "Not about liability.",
            excerpt: "",
          })),
    });
    expect(findings[0]).toMatchObject({ externalId: "a", relevant: false });
    expect(findings[1].relevant).toBeNull();
    expect(findings[1].determination).toContain("No determination");
    expect(findings[1].status).toBe("ok");
  });

  it("preserves input order in the emitted findings", async () => {
    const ids = ["c", "a", "b"];
    const findings = await processResearchSegment(ids.map(ref), {
      readDocument: async () => ({ text: "t", truncated: false }),
      classify: async (batch) =>
        batch.map((d) => ({
          externalId: d.externalId,
          relevant: false,
          determination: "n/a",
          excerpt: "",
        })),
    });
    expect(findings.map((f) => f.externalId)).toEqual(ids);
  });
});
