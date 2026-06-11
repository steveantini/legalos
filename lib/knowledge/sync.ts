import type { RemoteEntry, RemotePage } from "@/lib/knowledge/enumeration-parse";

/**
 * The collection-sync engine (Knowledge arc Step 1): walk every source's
 * folder tree through the repository's enumeration adapter and keep the
 * document INVENTORY current — metadata only, never content.
 *
 * SEGMENTED, like the workflow engine's durable segments: one invocation
 * performs at most `budget` enumeration calls (each a fast MCP listing, no
 * model calls), persisting inventory rows as it goes, and returns either
 * `completed` or a cursor the caller feeds back to continue in a fresh
 * request. That keeps every request comfortably inside the serverless
 * budget no matter how large a tree is, with no scheduler and no 500s.
 *
 * MISSING-MARKING is honest by watermark: every upserted row's
 * `last_seen_at` is stamped during the walk, and only when a source's walk
 * COMPLETES does `finalizeSource` flip rows the walk didn't touch
 * (last_seen_at older than the source's sync watermark) to 'missing'. A
 * partial walk never marks anything missing, so an interrupted sync can
 * never misreport documents as gone.
 *
 * Pure orchestration over injected deps (enumeration, persistence, clock),
 * so the walk/budget/watermark logic is unit-tested with fakes; the server
 * action wires the real MCP adapters and Supabase writes.
 */

/** Where a paused sync resumes. JSON-serializable; round-trips the client. */
export type SyncCursor = {
  /** Index into the sources array the walk is currently on. */
  sourceIndex: number;
  /** Folder ids still to list for the current source (BFS queue). */
  queue: string[];
  /** Continuation token within queue[0], when mid-folder. */
  pageToken: string | null;
  /** The current source's sync watermark (ISO); drives missing-marking. */
  sourceSyncStartedAt: string;
  /** Running totals across segments, for honest progress reporting. */
  documentsSeen: number;
  foldersWalked: number;
};

/** One source as the engine walks it. */
export type SyncSource = {
  id: string;
  rootReference: string;
  recursive: boolean;
};

/** The engine's injected dependencies. */
export type SyncDeps = {
  /** List one page of a folder's children for the given source. */
  listChildren(
    source: SyncSource,
    folderId: string,
    pageToken: string | null,
  ): Promise<RemotePage>;
  /** Persist inventory rows for these (non-folder) entries, stamping
   * last_seen_at now and status 'present'. */
  upsertDocuments(source: SyncSource, entries: RemoteEntry[]): Promise<void>;
  /** The source's walk completed: mark rows unseen since the watermark as
   * 'missing', recompute display provenance, stamp the source synced. */
  finalizeSource(source: SyncSource, watermarkIso: string): Promise<void>;
  /** Clock seam (ISO string), so tests are deterministic. */
  nowIso(): string;
};

export type SyncSegmentResult =
  | { completed: true; documentsSeen: number; foldersWalked: number }
  | {
      completed: false;
      cursor: SyncCursor;
      documentsSeen: number;
      foldersWalked: number;
    };

/** Enumeration calls per segment. Each is a fast listing (~100 entries), so a
 * segment covers ~3,000 documents while staying far inside the request
 * budget. */
export const SYNC_CALLS_PER_SEGMENT = 30;

/** A fresh cursor positioned at the start of a source. */
function startOfSource(
  sources: SyncSource[],
  sourceIndex: number,
  nowIso: string,
  totals: { documentsSeen: number; foldersWalked: number },
): SyncCursor {
  return {
    sourceIndex,
    queue: [sources[sourceIndex].rootReference],
    pageToken: null,
    sourceSyncStartedAt: nowIso,
    documentsSeen: totals.documentsSeen,
    foldersWalked: totals.foldersWalked,
  };
}

/**
 * Run one sync segment: continue from `cursor` (or start fresh) and walk
 * until every source completes or the call budget runs out.
 */
export async function runSyncSegment(
  sources: SyncSource[],
  cursor: SyncCursor | null,
  deps: SyncDeps,
  budget: number = SYNC_CALLS_PER_SEGMENT,
): Promise<SyncSegmentResult> {
  if (sources.length === 0) {
    return { completed: true, documentsSeen: 0, foldersWalked: 0 };
  }

  let state: SyncCursor =
    cursor ??
    startOfSource(sources, 0, deps.nowIso(), {
      documentsSeen: 0,
      foldersWalked: 0,
    });
  let callsLeft = budget;

  while (state.sourceIndex < sources.length) {
    const source = sources[state.sourceIndex];

    while (state.queue.length > 0) {
      if (callsLeft <= 0) {
        return {
          completed: false,
          cursor: state,
          documentsSeen: state.documentsSeen,
          foldersWalked: state.foldersWalked,
        };
      }

      const folderId = state.queue[0];
      callsLeft -= 1;
      const page = await deps.listChildren(source, folderId, state.pageToken);

      const documents = page.entries.filter((entry) => !entry.isFolder);
      if (documents.length > 0) {
        await deps.upsertDocuments(source, documents);
      }
      if (source.recursive) {
        for (const entry of page.entries) {
          if (entry.isFolder) state.queue.push(entry.id);
        }
      }
      state = {
        ...state,
        documentsSeen: state.documentsSeen + documents.length,
        ...(page.nextPageToken
          ? { pageToken: page.nextPageToken }
          : {
              // This folder is done: advance the queue.
              queue: state.queue.slice(1),
              pageToken: null,
              foldersWalked: state.foldersWalked + 1,
            }),
      };
    }

    // The source's walk completed in full: now (and only now) is
    // missing-marking honest.
    await deps.finalizeSource(source, state.sourceSyncStartedAt);

    const nextIndex = state.sourceIndex + 1;
    if (nextIndex >= sources.length) break;
    state = startOfSource(sources, nextIndex, deps.nowIso(), {
      documentsSeen: state.documentsSeen,
      foldersWalked: state.foldersWalked,
    });
  }

  return {
    completed: true,
    documentsSeen: state.documentsSeen,
    foldersWalked: state.foldersWalked,
  };
}
