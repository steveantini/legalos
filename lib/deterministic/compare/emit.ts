import type {
  ChangeSegment,
  ComparisonResult,
  ComparisonSummary,
  Granularity,
  Span,
} from "./contract";
import type { DiffOp } from "./diff";
import type { Token } from "./segment";

/**
 * Stage 4 of the comparison pipeline: EMIT.
 *
 * Pure: `(ops, normalizedOld, normalizedNew, ...) -> ComparisonResult`. Turns the
 * library-agnostic diff ops into the unified change-set contract:
 *
 *   - coalesces an adjacent delete+insert (in either order) into a single
 *     `replace` segment, the unit of legal materiality;
 *   - assigns every segment explicit spans into both documents, using a
 *     ZERO-WIDTH span on the side a change does not touch (at the exact position
 *     the change sits in that document);
 *   - derives the summary purely from the segments.
 *
 * Segment `text` is sliced from the normalized strings (not rebuilt from tokens)
 * so the invariant `segment text === normalized.slice(span)` holds by
 * construction.
 */

function spanOf(tokens: Token[]): Span {
  return { start: tokens[0].start, end: tokens[tokens.length - 1].end };
}

export function emit(
  ops: DiffOp[],
  normalizedOld: string,
  normalizedNew: string,
  granularity: Granularity,
  truncated: { old: boolean; new: boolean },
): ComparisonResult {
  const segments: ChangeSegment[] = [];

  // Char cursors track "where we are" in each document, so a standalone delete
  // or insert can record a zero-width span at the correct position on the side
  // it does not touch.
  let oldCursor = 0;
  let newCursor = 0;

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];

    if (op.op === "equal") {
      const oldSpan = spanOf(op.oldTokens);
      const newSpan = spanOf(op.newTokens);
      segments.push({
        type: "equal",
        text: normalizedNew.slice(newSpan.start, newSpan.end),
        oldSpan,
        newSpan,
      });
      oldCursor = oldSpan.end;
      newCursor = newSpan.end;
      continue;
    }

    if (op.op === "delete") {
      const next = ops[i + 1];
      const oldSpan = spanOf(op.tokens);
      if (next && next.op === "insert") {
        // delete + insert -> replace
        const newSpan = spanOf(next.tokens);
        segments.push({
          type: "replace",
          oldText: normalizedOld.slice(oldSpan.start, oldSpan.end),
          newText: normalizedNew.slice(newSpan.start, newSpan.end),
          oldSpan,
          newSpan,
        });
        oldCursor = oldSpan.end;
        newCursor = newSpan.end;
        i++; // consume the paired insert
      } else {
        segments.push({
          type: "delete",
          text: normalizedOld.slice(oldSpan.start, oldSpan.end),
          oldSpan,
          newSpan: { start: newCursor, end: newCursor },
        });
        oldCursor = oldSpan.end;
      }
      continue;
    }

    // op.op === "insert"
    const next = ops[i + 1];
    const newSpan = spanOf(op.tokens);
    if (next && next.op === "delete") {
      // insert + delete -> replace (jsdiff emits delete-first, but coalesce both
      // orders so the contract never depends on the library's emission order)
      const oldSpan = spanOf(next.tokens);
      segments.push({
        type: "replace",
        oldText: normalizedOld.slice(oldSpan.start, oldSpan.end),
        newText: normalizedNew.slice(newSpan.start, newSpan.end),
        oldSpan,
        newSpan,
      });
      oldCursor = oldSpan.end;
      newCursor = newSpan.end;
      i++; // consume the paired delete
    } else {
      segments.push({
        type: "insert",
        text: normalizedNew.slice(newSpan.start, newSpan.end),
        oldSpan: { start: oldCursor, end: oldCursor },
        newSpan,
      });
      newCursor = newSpan.end;
    }
  }

  return {
    segments,
    summary: summarize(segments),
    normalizedOld,
    normalizedNew,
    granularity,
    truncated,
  };
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function summarize(segments: ChangeSegment[]): ComparisonSummary {
  const segmentCounts = { equal: 0, insert: 0, delete: 0, replace: 0 };
  let wordsInserted = 0;
  let wordsDeleted = 0;

  for (const seg of segments) {
    segmentCounts[seg.type] += 1;
    if (seg.type === "insert") {
      wordsInserted += countWords(seg.text);
    } else if (seg.type === "delete") {
      wordsDeleted += countWords(seg.text);
    } else if (seg.type === "replace") {
      wordsInserted += countWords(seg.newText);
      wordsDeleted += countWords(seg.oldText);
    }
  }

  const changed =
    segmentCounts.insert + segmentCounts.delete + segmentCounts.replace > 0;

  return { changed, segmentCounts, wordsInserted, wordsDeleted };
}
