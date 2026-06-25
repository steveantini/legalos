import { diffArrays } from "diff";

import type { Token } from "./segment";

/**
 * Stage 3 of the comparison pipeline: ALIGN + DIFF.
 *
 * Pure: `(oldTokens, newTokens) -> DiffOp[]`. Computes the deterministic edit
 * script between the two token sequences.
 *
 * jsdiff (`diffArrays`, a Myers diff) is the alignment core, but it is WRAPPED
 * here and never leaks past this module: callers see only our `DiffOp` type over
 * our `Token`s. The library compares token VALUES (strict `===` on the value
 * strings); we map its result back onto our token OBJECTS (which carry spans) by
 * walking indices. Swapping the diff core later is a change confined to this
 * file.
 */

/** A library-agnostic diff operation over OUR tokens. */
export type DiffOp =
  | { readonly op: "equal"; readonly oldTokens: Token[]; readonly newTokens: Token[] }
  | { readonly op: "delete"; readonly tokens: Token[] }
  | { readonly op: "insert"; readonly tokens: Token[] };

export function diffTokens(oldTokens: Token[], newTokens: Token[]): DiffOp[] {
  const oldValues = oldTokens.map((t) => t.value);
  const newValues = newTokens.map((t) => t.value);

  // diffArrays guarantees: concatenating the value arrays of non-added parts
  // reconstructs oldValues, and of non-removed parts reconstructs newValues. So
  // walking `count` per part recovers the matching token OBJECTS by index.
  const parts = diffArrays(oldValues, newValues);

  const ops: DiffOp[] = [];
  let oldIndex = 0;
  let newIndex = 0;

  for (const part of parts) {
    const count = part.count ?? part.value.length;
    if (part.added) {
      ops.push({ op: "insert", tokens: newTokens.slice(newIndex, newIndex + count) });
      newIndex += count;
    } else if (part.removed) {
      ops.push({ op: "delete", tokens: oldTokens.slice(oldIndex, oldIndex + count) });
      oldIndex += count;
    } else {
      ops.push({
        op: "equal",
        oldTokens: oldTokens.slice(oldIndex, oldIndex + count),
        newTokens: newTokens.slice(newIndex, newIndex + count),
      });
      oldIndex += count;
      newIndex += count;
    }
  }

  return ops;
}
