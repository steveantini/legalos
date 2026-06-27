import { describe, expect, it } from "vitest";

import {
  dedupeDocumentRefsById,
  ensureFolderCollectionCore,
  synthesizeFolderName,
  type FolderKey,
} from "./folder-collections";

/** An in-memory stand-in for the DB: `create` records the folder so a later
 * `findExisting` reflects it, exactly as the unique index + reuse lookup do. */
function fakeStore() {
  const byFolder = new Map<string, string>();
  let counter = 0;
  const keyOf = (k: FolderKey) => `${k.connectionId}::${k.rootReference}`;
  return {
    creates: 0,
    findExisting: async (k: FolderKey) => byFolder.get(keyOf(k)) ?? null,
    create: async function (this: { creates: number }, k: FolderKey) {
      this.creates += 1;
      const id = `col_${(counter += 1)}`;
      byFolder.set(keyOf(k), id);
      return id;
    },
  };
}

describe("ensureFolderCollectionCore — idempotency", () => {
  it("same folder twice returns one collection (creates once)", async () => {
    const store = fakeStore();
    const key: FolderKey = { connectionId: "conn1", rootReference: "folderA" };
    const first = await ensureFolderCollectionCore(key, store);
    const second = await ensureFolderCollectionCore(key, store);
    expect(first).toBe(second);
    expect(store.creates).toBe(1);
  });

  it("different folders create distinct collections", async () => {
    const store = fakeStore();
    const a = await ensureFolderCollectionCore(
      { connectionId: "conn1", rootReference: "folderA" },
      store,
    );
    const b = await ensureFolderCollectionCore(
      { connectionId: "conn1", rootReference: "folderB" },
      store,
    );
    expect(a).not.toBe(b);
    expect(store.creates).toBe(2);
  });

  it("the same root_reference under a different connection is a distinct folder", async () => {
    const store = fakeStore();
    const a = await ensureFolderCollectionCore(
      { connectionId: "conn1", rootReference: "shared" },
      store,
    );
    const b = await ensureFolderCollectionCore(
      { connectionId: "conn2", rootReference: "shared" },
      store,
    );
    expect(a).not.toBe(b);
    expect(store.creates).toBe(2);
  });

  it("reuses an existing collection without creating", async () => {
    const store = fakeStore();
    const key: FolderKey = { connectionId: "conn1", rootReference: "folderA" };
    await ensureFolderCollectionCore(key, store); // create
    store.creates = 0;
    const reused = await ensureFolderCollectionCore(key, store);
    expect(reused).toBe("col_1");
    expect(store.creates).toBe(0);
  });
});

describe("dedupeDocumentRefsById — extract-once across a per-set union", () => {
  it("a document reachable through two folders of the set appears once", () => {
    // The same anchor (doc1) reached via two folders, plus a distinct doc.
    const union = [
      { documentId: "doc1", externalId: "x", from: "folderA" },
      { documentId: "doc2", externalId: "y", from: "folderA" },
      { documentId: "doc1", externalId: "x", from: "folderB" },
    ];
    const deduped = dedupeDocumentRefsById(union);
    expect(deduped.map((d) => d.documentId).sort()).toEqual(["doc1", "doc2"]);
    // First-seen wins, so the shared doc is extracted once (from folderA here).
    expect(deduped.find((d) => d.documentId === "doc1")?.from).toBe("folderA");
  });

  it("is a no-op when there are no duplicates", () => {
    const refs = [{ documentId: "a" }, { documentId: "b" }, { documentId: "c" }];
    expect(dedupeDocumentRefsById(refs)).toHaveLength(3);
  });

  it("handles an empty union", () => {
    expect(dedupeDocumentRefsById([])).toEqual([]);
  });
});

describe("synthesizeFolderName", () => {
  it("uses the last breadcrumb segment", () => {
    expect(synthesizeFolderName(["Legal", "Contracts"], "Google Drive")).toBe("Contracts");
  });
  it("falls back to the server name when there is no path", () => {
    expect(synthesizeFolderName([], "Google Drive")).toBe("Google Drive");
  });
  it("falls back to a constant when both are empty", () => {
    expect(synthesizeFolderName([], "")).toBe("Folder");
  });
  it("caps to 80 chars", () => {
    expect(synthesizeFolderName(["x".repeat(120)], "Drive").length).toBe(80);
  });
});
