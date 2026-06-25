import { describe, expect, it } from "vitest";

import { diffTokens } from "./diff";
import { segment } from "./segment";

const tok = (s: string) => segment(s);

describe("diffTokens", () => {
  it("returns a single equal op for identical sequences", () => {
    const ops = diffTokens(tok("a b c"), tok("a b c"));
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe("equal");
  });

  it("returns no ops for two empty token sequences", () => {
    expect(diffTokens([], [])).toEqual([]);
  });

  it("emits a single insert when the old side is empty", () => {
    const ops = diffTokens([], tok("hello world"));
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe("insert");
  });

  it("emits a single delete when the new side is empty", () => {
    const ops = diffTokens(tok("hello world"), []);
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe("delete");
  });

  it("emits adjacent delete then insert for a replacement", () => {
    const ops = diffTokens(tok("Net 30"), tok("Net 60"));
    const kinds = ops.map((o) => o.op);
    expect(kinds).toContain("delete");
    expect(kinds).toContain("insert");
    const di = kinds.indexOf("delete");
    expect(kinds[di + 1]).toBe("insert"); // adjacency lets emit coalesce a replace
  });

  it("preserves the original token spans (no re-derivation)", () => {
    const oldTokens = tok("Net 30");
    const ops = diffTokens(oldTokens, tok("Net 60"));
    const del = ops.find((o) => o.op === "delete");
    expect(del && del.op === "delete" ? del.tokens[0] : null).toEqual({
      value: "30",
      start: 4,
      end: 6,
    });
  });

  it("reconstructs both inputs from the ops (edit-script invariant)", () => {
    const oldTokens = tok("the quick brown fox jumps");
    const newTokens = tok("the slow brown fox leaps high");
    const ops = diffTokens(oldTokens, newTokens);

    const oldFromOps = ops
      .flatMap((o) => (o.op === "equal" ? o.oldTokens : o.op === "delete" ? o.tokens : []))
      .map((t) => t.value)
      .join("");
    const newFromOps = ops
      .flatMap((o) => (o.op === "equal" ? o.newTokens : o.op === "insert" ? o.tokens : []))
      .map((t) => t.value)
      .join("");

    expect(oldFromOps).toBe(oldTokens.map((t) => t.value).join(""));
    expect(newFromOps).toBe(newTokens.map((t) => t.value).join(""));
  });
});
