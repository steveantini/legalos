import { describe, expect, it } from "vitest";

import type { RemoteEntry, RemotePage } from "@/lib/knowledge/enumeration-parse";
import {
  runSyncSegment,
  type SyncCursor,
  type SyncDeps,
  type SyncSource,
} from "@/lib/knowledge/sync";

/**
 * The sync engine's contract: walk every source's tree within a per-segment
 * call budget, persist documents as it goes, finalize (missing-marking +
 * provenance recompute) ONLY when a source's walk completes, and hand back a
 * resumable cursor when the budget runs out. Tested with fakes, like the
 * workflow engine.
 */

function doc(id: string): RemoteEntry {
  return {
    id,
    name: `${id}.pdf`,
    isFolder: false,
    mimeType: "application/pdf",
    sizeBytes: 100,
    modifiedAt: "2026-06-01T00:00:00Z",
    url: `https://example.com/${id}`,
  };
}

function folder(id: string): RemoteEntry {
  return {
    id,
    name: id,
    isFolder: true,
    mimeType: "application/vnd.google-apps.folder",
    sizeBytes: null,
    modifiedAt: null,
    url: null,
  };
}

/** A fake repository: folderId → pages. One page unless listed twice. */
type FakeTree = Record<string, RemotePage[]>;

function makeDeps(tree: FakeTree) {
  const upserts: { sourceId: string; ids: string[] }[] = [];
  const finalized: { sourceId: string; watermark: string }[] = [];
  let listCalls = 0;
  const pageIndex = new Map<string, number>();

  const deps: SyncDeps = {
    async listChildren(source, folderId, pageToken) {
      listCalls += 1;
      const pages = tree[folderId];
      if (!pages) throw new Error(`unknown folder ${folderId}`);
      const index = pageToken ? Number(pageToken) : 0;
      pageIndex.set(folderId, index);
      return pages[index];
    },
    async upsertDocuments(source, entries) {
      upserts.push({ sourceId: source.id, ids: entries.map((e) => e.id) });
    },
    async finalizeSource(source, watermarkIso) {
      finalized.push({ sourceId: source.id, watermark: watermarkIso });
    },
    nowIso: () => "2026-06-11T12:00:00.000Z",
  };

  return {
    deps,
    upserts,
    finalized,
    get listCalls() {
      return listCalls;
    },
  };
}

const SOURCE_A: SyncSource = { id: "src-a", rootReference: "rootA", recursive: true };

describe("runSyncSegment", () => {
  it("walks a single-page source, upserts its documents, and finalizes", async () => {
    const fake = makeDeps({
      rootA: [{ entries: [doc("d1"), doc("d2")], nextPageToken: null }],
    });
    const result = await runSyncSegment([SOURCE_A], null, fake.deps);
    expect(result.completed).toBe(true);
    expect(result.documentsSeen).toBe(2);
    expect(fake.upserts).toEqual([{ sourceId: "src-a", ids: ["d1", "d2"] }]);
    expect(fake.finalized).toEqual([
      { sourceId: "src-a", watermark: "2026-06-11T12:00:00.000Z" },
    ]);
  });

  it("paginates within a folder and recurses into subfolders", async () => {
    const fake = makeDeps({
      rootA: [
        { entries: [doc("d1"), folder("sub")], nextPageToken: "1" },
        { entries: [doc("d2")], nextPageToken: null },
      ],
      sub: [{ entries: [doc("d3")], nextPageToken: null }],
    });
    const result = await runSyncSegment([SOURCE_A], null, fake.deps);
    expect(result.completed).toBe(true);
    expect(result.documentsSeen).toBe(3);
    expect(result.foldersWalked).toBe(2);
    expect(fake.listCalls).toBe(3);
  });

  it("does not descend into subfolders when the source is non-recursive", async () => {
    const fake = makeDeps({
      rootA: [{ entries: [doc("d1"), folder("sub")], nextPageToken: null }],
    });
    const result = await runSyncSegment(
      [{ ...SOURCE_A, recursive: false }],
      null,
      fake.deps,
    );
    expect(result.completed).toBe(true);
    expect(result.documentsSeen).toBe(1);
    expect(fake.listCalls).toBe(1);
  });

  it("stops at the budget with a resumable cursor and finalizes NOTHING mid-walk", async () => {
    const fake = makeDeps({
      rootA: [
        { entries: [doc("d1"), folder("sub")], nextPageToken: null },
      ],
      sub: [{ entries: [doc("d2")], nextPageToken: null }],
    });
    const result = await runSyncSegment([SOURCE_A], null, fake.deps, 1);
    expect(result.completed).toBe(false);
    if (result.completed) throw new Error("unreachable");
    expect(result.cursor.queue).toEqual(["sub"]);
    expect(result.documentsSeen).toBe(1);
    // The interrupted walk must not have marked anything missing.
    expect(fake.finalized).toEqual([]);

    // Resuming with the cursor completes the walk and finalizes with the
    // ORIGINAL watermark, so missing-marking spans the whole pass.
    const resumed = await runSyncSegment([SOURCE_A], result.cursor, fake.deps, 10);
    expect(resumed.completed).toBe(true);
    expect(resumed.documentsSeen).toBe(2);
    expect(fake.finalized).toEqual([
      { sourceId: "src-a", watermark: "2026-06-11T12:00:00.000Z" },
    ]);
  });

  it("walks multiple sources in order, each finalized on its own completion", async () => {
    const sourceB: SyncSource = { id: "src-b", rootReference: "rootB", recursive: true };
    const fake = makeDeps({
      rootA: [{ entries: [doc("a1")], nextPageToken: null }],
      rootB: [{ entries: [doc("b1"), doc("b2")], nextPageToken: null }],
    });
    const result = await runSyncSegment([SOURCE_A, sourceB], null, fake.deps);
    expect(result.completed).toBe(true);
    expect(result.documentsSeen).toBe(3);
    expect(fake.finalized.map((f) => f.sourceId)).toEqual(["src-a", "src-b"]);
  });

  it("completes immediately with no sources", async () => {
    const fake = makeDeps({});
    const result = await runSyncSegment([], null, fake.deps);
    expect(result).toEqual({ completed: true, documentsSeen: 0, foldersWalked: 0 });
  });

  it("carries running totals across segments via the cursor", async () => {
    const fake = makeDeps({
      rootA: [
        { entries: [doc("d1")], nextPageToken: "1" },
        { entries: [doc("d2")], nextPageToken: "2" },
        { entries: [doc("d3")], nextPageToken: null },
      ],
    });
    const first = await runSyncSegment([SOURCE_A], null, fake.deps, 2);
    expect(first.completed).toBe(false);
    const cursor = (first as { cursor: SyncCursor }).cursor;
    expect(first.documentsSeen).toBe(2);
    const second = await runSyncSegment([SOURCE_A], cursor, fake.deps, 2);
    expect(second.completed).toBe(true);
    expect(second.documentsSeen).toBe(3);
  });
});
