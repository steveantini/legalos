import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { compareDocuments } from "@/lib/deterministic/compare";

import {
  assembleDocumentComparePreStep,
  COMPARISON_CONTEXT_WORDS,
  serializeComparison,
} from "./document-compare";

const LABELS = { originalLabel: "orig.docx", revisedLabel: "rev.docx" };

/** Count enumerated "Change N (" entries in a serialized block. */
function changeCount(block: string): number {
  return (block.match(/^Change \d+ \(/gm) ?? []).length;
}

describe("serializeComparison", () => {
  it("is deterministic: identical inputs produce byte-identical output", () => {
    const result = compareDocuments({ text: "Net 30 net" }, { text: "Net 60 net" });
    const a = serializeComparison(result, LABELS);
    const b = serializeComparison(result, LABELS);
    expect(a).toBe(b);
  });

  it("labels which document is original and which is revised", () => {
    const result = compareDocuments({ text: "Net 30" }, { text: "Net 60" });
    const block = serializeComparison(result, LABELS);
    expect(block).toContain('Original document (older version): "orig.docx"');
    expect(block).toContain('Revised document (newer version): "rev.docx"');
  });

  it("represents a replacement with both sides labeled original vs revised", () => {
    const result = compareDocuments({ text: "Net 30" }, { text: "Net 60" });
    const block = serializeComparison(result, LABELS);
    expect(block).toContain("Change 1 (replace):");
    expect(block).toContain('Removed from original: "30"');
    expect(block).toContain('Added in revised: "60"');
  });

  it("represents a pure insertion and a pure deletion with the right labels", () => {
    const inserted = serializeComparison(
      compareDocuments({ text: "alpha beta" }, { text: "alpha gamma beta" }),
      LABELS,
    );
    expect(inserted).toContain("(insert):");
    // The engine preserves whitespace losslessly, so the inserted token may carry
    // a trailing space; match the labeled word without depending on exact spacing.
    expect(inserted).toContain('Added in revised: "gamma');

    const deleted = serializeComparison(
      compareDocuments({ text: "alpha gamma beta" }, { text: "alpha beta" }),
      LABELS,
    );
    expect(deleted).toContain("(delete):");
    expect(deleted).toContain('Removed from original: "gamma');
  });

  it("represents EVERY change exactly once (the count matches the summary)", () => {
    const result = compareDocuments(
      { text: "one two three four five six" },
      { text: "one TWO three FOUR five SIX seven" },
    );
    const counts = result.summary.segmentCounts;
    const total = counts.insert + counts.delete + counts.replace;
    expect(total).toBeGreaterThan(0);
    expect(changeCount(serializeComparison(result, LABELS))).toBe(total);
  });

  it("emits an explicit no-changes block for identical documents", () => {
    const result = compareDocuments({ text: "Net 30" }, { text: "Net 30" });
    expect(result.summary.changed).toBe(false);
    const block = serializeComparison(result, LABELS);
    expect(block).toContain("identical after normalization");
    expect(block).toContain("Changes: none");
    expect(changeCount(block)).toBe(0);
  });

  it("bounds equal context to COMPARISON_CONTEXT_WORDS per side (no whole-doc dump)", () => {
    const before = "one two three four five six seven eight";
    const after = "nine ten eleven twelve";
    const result = compareDocuments(
      { text: `${before} CHANGED ${after}` },
      { text: `${before} ALTERED ${after}` },
    );
    const block = serializeComparison(result, LABELS);
    // Before has 8 words; only the last COMPARISON_CONTEXT_WORDS (6) survive,
    // prefixed with an ellipsis. After has 4 words (<= 6) so it is shown whole.
    expect(COMPARISON_CONTEXT_WORDS).toBe(6);
    expect(block).toContain('Context before: "...three four five six seven eight"');
    expect(block).toContain('Context after: "nine ten eleven twelve"');
    expect(block).not.toContain("one two three");
  });

  it("does not dump a large unchanged document (windowing keeps the block small)", () => {
    const preamble = Array(200).fill("alpha").join(" ");
    const result = compareDocuments(
      { text: `${preamble} TARGETONE` },
      { text: `${preamble} TARGETTWO` },
    );
    const block = serializeComparison(result, LABELS);
    // The 200-word identical preamble must NOT be dumped; only a bounded window
    // of it appears as context around the single change.
    const alphaInBlock = (block.match(/alpha/g) ?? []).length;
    expect(alphaInBlock).toBeLessThanOrEqual(COMPARISON_CONTEXT_WORDS + 1);
    expect(block).toContain("TARGETONE");
    expect(block).toContain("TARGETTWO");
  });

  it("surfaces truncation when either side hit the extraction cap", () => {
    const base = compareDocuments({ text: "Net 30" }, { text: "Net 60" });
    expect(
      serializeComparison({ ...base, truncated: { old: true, new: false } }, LABELS),
    ).toContain("the original document exceeded the extraction limit");
    expect(
      serializeComparison({ ...base, truncated: { old: false, new: true } }, LABELS),
    ).toContain("the revised document exceeded the extraction limit");
    expect(
      serializeComparison({ ...base, truncated: { old: true, new: true } }, LABELS),
    ).toContain("both documents exceeded the extraction limit");
    // No truncation note when neither side was capped.
    expect(serializeComparison(base, LABELS)).not.toContain(
      "exceeded the extraction limit",
    );
  });
});

describe("assembleDocumentComparePreStep", () => {
  it("reads documents by ROLE (not order) and returns the authoritative block", () => {
    // Pass revised BEFORE original to prove order does not matter: roles do.
    const outcome = assembleDocumentComparePreStep([
      { role: "revised", label: "b.docx", text: "Net 60" },
      { role: "original", label: "a.docx", text: "Net 30" },
    ]);
    expect(outcome.status).toBe("ready");
    if (outcome.status !== "ready") return;
    expect(outcome.authoritativeBlock).toContain('<document_comparison authoritative="true">');
    expect(outcome.authoritativeBlock).toContain('Original document (older version): "a.docx"');
    expect(outcome.authoritativeBlock).toContain('Revised document (newer version): "b.docx"');
    expect(outcome.authoritativeBlock).toContain('Removed from original: "30"');
    expect(outcome.authoritativeBlock).toContain('Added in revised: "60"');
  });

  it("does NOT present the two full raw documents as compare-these", () => {
    const docA = `${Array(150).fill("foo").join(" ")} ONEONE`;
    const docB = `${Array(150).fill("foo").join(" ")} TWOTWO`;
    const outcome = assembleDocumentComparePreStep([
      { role: "original", label: "a", text: docA },
      { role: "revised", label: "b", text: docB },
    ]);
    expect(outcome.status).toBe("ready");
    if (outcome.status !== "ready") return;
    // The whole raw documents are never embedded: the block is the windowed change
    // set, far smaller than the two raw docs concatenated.
    expect(outcome.authoritativeBlock.length).toBeLessThan(docA.length + docB.length);
    expect((outcome.authoritativeBlock.match(/foo/g) ?? []).length).toBeLessThan(
      150,
    );
  });

  it("threads document truncation through into the block", () => {
    const outcome = assembleDocumentComparePreStep([
      { role: "original", label: "a", text: "Net 30", truncated: true },
      { role: "revised", label: "b", text: "Net 60" },
    ]);
    expect(outcome.status).toBe("ready");
    if (outcome.status !== "ready") return;
    expect(outcome.authoritativeBlock).toContain(
      "the original document exceeded the extraction limit",
    );
  });

  it("guards (no engine run) with a role-named message when a slot is missing", () => {
    const none = assembleDocumentComparePreStep([]);
    expect(none.status).toBe("guard");
    if (none.status === "guard") {
      expect(none.message).toContain("original version and the revised version");
    }

    const onlyOriginal = assembleDocumentComparePreStep([
      { role: "original", label: "a", text: "hi" },
    ]);
    expect(onlyOriginal.status).toBe("guard");
    if (onlyOriginal.status === "guard") {
      expect(onlyOriginal.message).toContain("Add the revised version");
    }

    const onlyRevised = assembleDocumentComparePreStep([
      { role: "revised", label: "b", text: "hi" },
    ]);
    expect(onlyRevised.status).toBe("guard");
    if (onlyRevised.status === "guard") {
      expect(onlyRevised.message).toContain("Add the original version");
    }
  });

  it("guards with a role-named message when a slot's document has no text", () => {
    const emptyOriginal = assembleDocumentComparePreStep([
      { role: "original", label: "a", text: "  \n " },
      { role: "revised", label: "b", text: "real content" },
    ]);
    expect(emptyOriginal.status).toBe("guard");
    if (emptyOriginal.status === "guard") {
      expect(emptyOriginal.message).toContain("original document has no readable text");
    }

    const emptyRevised = assembleDocumentComparePreStep([
      { role: "original", label: "a", text: "real content" },
      { role: "revised", label: "b", text: "" },
    ]);
    expect(emptyRevised.status).toBe("guard");
    if (emptyRevised.status === "guard") {
      expect(emptyRevised.message).toContain("revised document has no readable text");
    }
  });

  it("keeps all guard copy free of em dashes (user-facing copy convention)", () => {
    const guards = [
      assembleDocumentComparePreStep([]),
      assembleDocumentComparePreStep([{ role: "original", label: "a", text: "x" }]),
      assembleDocumentComparePreStep([{ role: "revised", label: "b", text: "x" }]),
      assembleDocumentComparePreStep([
        { role: "original", label: "a", text: "real" },
        { role: "revised", label: "b", text: "" },
      ]),
    ];
    for (const m of guards) {
      expect(m.status).toBe("guard");
      if (m.status === "guard") expect(m.message).not.toContain("—");
    }
  });
});

describe("module boundary: lib/deterministic stays pure", () => {
  it("the comparison engine never imports the consumer side (one-way dependency)", () => {
    const engineDir = join(process.cwd(), "lib/deterministic/compare");
    const files = readdirSync(engineDir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(join(engineDir, file), "utf8");
      // The engine must not reach "up" into agents/run/chat consumers.
      expect(source).not.toMatch(/from\s+["']@\/lib\/agents/);
      expect(source).not.toMatch(/from\s+["']@\/lib\/chat/);
      expect(source).not.toMatch(/pre-steps/);
    }
  });
});
