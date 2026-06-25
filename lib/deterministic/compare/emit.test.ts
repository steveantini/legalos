import { describe, expect, it } from "vitest";

import { diffTokens, type DiffOp } from "./diff";
import { emit } from "./emit";
import { segment, type Token } from "./segment";

const NO_TRUNC = { old: false, new: false };

/** Build ops the realistic way: normalize-free segment + diff of two strings. */
function opsFor(oldText: string, newText: string): {
  ops: DiffOp[];
  oldText: string;
  newText: string;
} {
  return { ops: diffTokens(segment(oldText), segment(newText)), oldText, newText };
}

describe("emit", () => {
  it("emits a single equal segment for identical text, with matching spans", () => {
    const { ops } = opsFor("Net 30", "Net 30");
    const r = emit(ops, "Net 30", "Net 30", "word", NO_TRUNC);
    expect(r.segments).toEqual([
      { type: "equal", text: "Net 30", oldSpan: { start: 0, end: 6 }, newSpan: { start: 0, end: 6 } },
    ]);
    expect(r.summary.changed).toBe(false);
  });

  it("coalesces an adjacent delete+insert into a replace segment", () => {
    const { ops } = opsFor("Net 30", "Net 60");
    const r = emit(ops, "Net 30", "Net 60", "word", NO_TRUNC);
    expect(r.segments).toEqual([
      { type: "equal", text: "Net ", oldSpan: { start: 0, end: 4 }, newSpan: { start: 0, end: 4 } },
      {
        type: "replace",
        oldText: "30",
        newText: "60",
        oldSpan: { start: 4, end: 6 },
        newSpan: { start: 4, end: 6 },
      },
    ]);
    expect(r.summary).toEqual({
      changed: true,
      segmentCounts: { equal: 1, insert: 0, delete: 0, replace: 1 },
      wordsInserted: 1,
      wordsDeleted: 1,
    });
  });

  it("gives a standalone delete a zero-width new span at the deletion point", () => {
    // old "a b c" -> new "a c": "b " is removed.
    const { ops } = opsFor("a b c", "a c");
    const r = emit(ops, "a b c", "a c", "word", NO_TRUNC);
    const del = r.segments.find((s) => s.type === "delete");
    expect(del).toBeDefined();
    if (del && del.type === "delete") {
      expect(del.newSpan.start).toBe(del.newSpan.end); // zero-width on the new side
      expect("a c".slice(del.newSpan.start, del.newSpan.end)).toBe("");
    }
  });

  it("gives a standalone insert a zero-width old span at the insertion point", () => {
    const { ops } = opsFor("a c", "a b c");
    const r = emit(ops, "a c", "a b c", "word", NO_TRUNC);
    const ins = r.segments.find((s) => s.type === "insert");
    expect(ins).toBeDefined();
    if (ins && ins.type === "insert") {
      expect(ins.oldSpan.start).toBe(ins.oldSpan.end); // zero-width on the old side
    }
  });

  it("coalesces an insert-then-delete order into a replace (library-order independent)", () => {
    // Hand-built ops in the non-jsdiff order to prove emit does not depend on it.
    const oldTok: Token[] = segment("30");
    const newTok: Token[] = segment("60");
    const ops: DiffOp[] = [
      { op: "insert", tokens: newTok },
      { op: "delete", tokens: oldTok },
    ];
    const r = emit(ops, "30", "60", "word", NO_TRUNC);
    expect(r.segments).toEqual([
      {
        type: "replace",
        oldText: "30",
        newText: "60",
        oldSpan: { start: 0, end: 2 },
        newSpan: { start: 0, end: 2 },
      },
    ]);
  });

  it("derives the summary purely from the segments", () => {
    const { ops } = opsFor("alpha beta gamma", "alpha delta gamma epsilon");
    const r = emit(ops, "alpha beta gamma", "alpha delta gamma epsilon", "word", NO_TRUNC);
    const counts = r.summary.segmentCounts;
    expect(counts.equal + counts.insert + counts.delete + counts.replace).toBe(
      r.segments.length,
    );
    expect(r.summary.changed).toBe(true);
  });

  it("returns an empty change set with changed=false for no ops", () => {
    const r = emit([], "", "", "word", NO_TRUNC);
    expect(r.segments).toEqual([]);
    expect(r.summary.changed).toBe(false);
    expect(r.summary.segmentCounts).toEqual({ equal: 0, insert: 0, delete: 0, replace: 0 });
  });

  it("passes the truncation flags through unchanged", () => {
    const r = emit([], "", "", "word", { old: true, new: false });
    expect(r.truncated).toEqual({ old: true, new: false });
  });
});
