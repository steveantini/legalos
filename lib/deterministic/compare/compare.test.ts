import { describe, expect, it } from "vitest";

import { compareDocuments } from "./compare";
import type { ComparisonResult } from "./contract";

const doc = (text: string, truncated?: boolean) => ({ text, truncated });

/**
 * The binding invariants every result must satisfy. These are the contract's
 * guarantees: a redline renderer and a model both rely on them.
 */
function assertContractInvariants(r: ComparisonResult): void {
  // 1. Lossless reconstruction of BOTH normalized documents from the segments.
  let oldRebuilt = "";
  let newRebuilt = "";
  for (const seg of r.segments) {
    if (seg.type === "equal") {
      oldRebuilt += seg.text;
      newRebuilt += seg.text;
    } else if (seg.type === "delete") {
      oldRebuilt += seg.text;
    } else if (seg.type === "insert") {
      newRebuilt += seg.text;
    } else {
      oldRebuilt += seg.oldText;
      newRebuilt += seg.newText;
    }
  }
  expect(oldRebuilt).toBe(r.normalizedOld);
  expect(newRebuilt).toBe(r.normalizedNew);

  // 2. Spans are contiguous and cover [0, len) on each side; the absent side of
  //    a change is a zero-width span at the running cursor; span text matches.
  let oldCursor = 0;
  let newCursor = 0;
  for (const seg of r.segments) {
    const oldText = seg.type === "replace" ? seg.oldText : seg.type === "insert" ? "" : seg.text;
    const newText = seg.type === "replace" ? seg.newText : seg.type === "delete" ? "" : seg.text;

    expect(seg.oldSpan.start).toBe(oldCursor);
    expect(seg.newSpan.start).toBe(newCursor);
    expect(r.normalizedOld.slice(seg.oldSpan.start, seg.oldSpan.end)).toBe(oldText);
    expect(r.normalizedNew.slice(seg.newSpan.start, seg.newSpan.end)).toBe(newText);

    oldCursor = seg.oldSpan.end;
    newCursor = seg.newSpan.end;
  }
  expect(oldCursor).toBe(r.normalizedOld.length);
  expect(newCursor).toBe(r.normalizedNew.length);

  // 3. Summary counts match the segments.
  const c = r.summary.segmentCounts;
  expect(c.equal + c.insert + c.delete + c.replace).toBe(r.segments.length);
  expect(r.summary.changed).toBe(c.insert + c.delete + c.replace > 0);
}

const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["The quick brown fox", "The quick brown fox"],
  ["The quick brown fox", "The slow brown fox"],
  ["alpha beta gamma", "alpha gamma"],
  ["alpha gamma", "alpha beta gamma"],
  ["", "hello world"],
  ["hello world", ""],
  ["", ""],
  ["Payment is Net 30 days.", "Payment is Net 60 days, plus interest."],
  ["one\ntwo\nthree", "one\nTWO\nthree\nfour"],
  ["start middle end", "START middle END"],
];

describe("compareDocuments — determinism & purity", () => {
  it("produces byte-identical output on a repeated run (deep + serialized equality)", () => {
    for (const [a, b] of PAIRS) {
      const r1 = compareDocuments(doc(a), doc(b));
      const r2 = compareDocuments(doc(a), doc(b));
      expect(r1).toEqual(r2);
      expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    }
  });
});

describe("compareDocuments — contract invariants hold for every pair", () => {
  for (const [a, b] of PAIRS) {
    it(`invariants: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`, () => {
      assertContractInvariants(compareDocuments(doc(a), doc(b)));
    });
  }
});

describe("compareDocuments — edge cases", () => {
  it("identical documents: changed=false, only an equal segment, no changes", () => {
    const r = compareDocuments(doc("Hello there, world."), doc("Hello there, world."));
    expect(r.summary.changed).toBe(false);
    expect(r.summary.segmentCounts).toEqual({ equal: 1, insert: 0, delete: 0, replace: 0 });
    expect(r.segments.every((s) => s.type === "equal")).toBe(true);
  });

  it("both documents empty: empty change set, changed=false", () => {
    const r = compareDocuments(doc(""), doc(""));
    expect(r.segments).toEqual([]);
    expect(r.summary.changed).toBe(false);
    expect(r.normalizedOld).toBe("");
    expect(r.normalizedNew).toBe("");
  });

  it("old empty: a single insert covering the whole new document", () => {
    const r = compareDocuments(doc(""), doc("brand new clause"));
    expect(r.summary.segmentCounts).toEqual({ equal: 0, insert: 1, delete: 0, replace: 0 });
    expect(r.segments[0]).toMatchObject({ type: "insert", text: "brand new clause" });
    assertContractInvariants(r);
  });

  it("new empty: a single delete covering the whole old document", () => {
    const r = compareDocuments(doc("removed entirely"), doc(""));
    expect(r.summary.segmentCounts).toEqual({ equal: 0, insert: 0, delete: 1, replace: 0 });
    expect(r.segments[0]).toMatchObject({ type: "delete", text: "removed entirely" });
    assertContractInvariants(r);
  });

  it("horizontal-whitespace-amount differences are not material (collapsed by normalization)", () => {
    // Spaces/tabs/indentation amount is non-material: both normalize to "a b c".
    const r = compareDocuments(doc("  a   b \t c "), doc("a b c"));
    expect(r.summary.changed).toBe(false);
  });

  it("preserves newline structure: a line break vs a space IS a real difference (documented policy)", () => {
    const r = compareDocuments(doc("a b c"), doc("a b\nc"));
    expect(r.summary.changed).toBe(true);
  });

  it("a change at the very start is captured with spans from offset 0", () => {
    const r = compareDocuments(doc("FOO bar baz"), doc("QUUX bar baz"));
    expect(r.segments[0]).toEqual({
      type: "replace",
      oldText: "FOO",
      newText: "QUUX",
      oldSpan: { start: 0, end: 3 },
      newSpan: { start: 0, end: 4 },
    });
    assertContractInvariants(r);
  });

  it("a change at the very end is captured at the document tail", () => {
    const r = compareDocuments(doc("bar baz FOO"), doc("bar baz QUUX"));
    const last = r.segments[r.segments.length - 1];
    expect(last).toMatchObject({ type: "replace", oldText: "FOO", newText: "QUUX" });
    expect(last.oldSpan.end).toBe(r.normalizedOld.length);
    expect(last.newSpan.end).toBe(r.normalizedNew.length);
    assertContractInvariants(r);
  });

  it("handles a large input deterministically and losslessly", () => {
    const big = Array.from({ length: 5000 }, (_, i) => `word${i}`).join(" ");
    const bigEdited = big.replace("word2500", "WORD2500").replace("word4999", "");
    const r1 = compareDocuments(doc(big), doc(bigEdited));
    const r2 = compareDocuments(doc(big), doc(bigEdited));
    expect(r1).toEqual(r2);
    assertContractInvariants(r1);
    expect(r1.summary.changed).toBe(true);
  });
});

describe("compareDocuments — realistic prose & renderability", () => {
  it("captures a legal substitution as a replace and reconstructs the redline", () => {
    const before = "The term is Net 30 days. Payment is due on receipt.";
    const after = "The term is Net 60 days. Payment is due upon receipt of the invoice.";
    const r = compareDocuments(doc(before), doc(after));

    expect(r.summary.changed).toBe(true);
    // The 30 -> 60 substitution is present as a replace.
    const replaced = r.segments.filter((s) => s.type === "replace");
    expect(replaced.some((s) => s.type === "replace" && s.oldText === "30" && s.newText === "60")).toBe(true);
    // Inserted content ("of the invoice") shows up on the new side.
    expect(r.summary.wordsInserted).toBeGreaterThan(0);

    // A renderer walking newSpan/oldSpan reproduces both documents exactly.
    assertContractInvariants(r);
  });

  it("defaults to word granularity and surfaces it on the result", () => {
    const r = compareDocuments(doc("a"), doc("b"));
    expect(r.granularity).toBe("word");
  });

  it("surfaces the truncation passthrough flags", () => {
    const r = compareDocuments(doc("x", true), doc("y", false));
    expect(r.truncated).toEqual({ old: true, new: false });
  });
});
