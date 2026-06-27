import { describe, expect, it } from "vitest";

import {
  aggregatePreparationState,
  groupFoldersByKind,
  type QueryFolder,
} from "@/lib/knowledge/document-kinds";

/**
 * Tests for the pure kind-resolution layer (Structured Query Step 3b). These
 * pin the three states the surface branches on — one kind, several kinds, an
 * unset kind — and the cross-folder aggregation, so the view's ask / which-kind /
 * set-it-up decision can never drift from the data.
 */

function folder(over: Partial<QueryFolder>): QueryFolder {
  return {
    id: "f1",
    name: "Folder",
    provenance: [],
    documentCount: 0,
    lastSyncedAt: null,
    schemaId: null,
    schemaName: null,
    attributes: [],
    preparationState: "no_schema",
    ...over,
  };
}

const nda = { key: "agreement_type", label: "Agreement type", type: "text" as const };

describe("groupFoldersByKind", () => {
  it("returns no groups for no folders", () => {
    expect(groupFoldersByKind([])).toEqual([]);
  });

  it("collapses folders of one prepared kind into a single askable group", () => {
    const groups = groupFoldersByKind([
      folder({ id: "a", name: "NDAs US", schemaId: "s1", schemaName: "Agreements", attributes: [nda], documentCount: 3, preparationState: "ready" }),
      folder({ id: "b", name: "NDAs EU", schemaId: "s1", schemaName: "Agreements", attributes: [nda], documentCount: 2, preparationState: "ready" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].schemaId).toBe("s1");
    expect(groups[0].folderIds).toEqual(["a", "b"]);
    expect(groups[0].documentCount).toBe(5);
    expect(groups[0].hasSchema).toBe(true);
    expect(groups[0].prepared).toBe(true);
  });

  it("separates folders that belong to different kinds, unset kind last", () => {
    const groups = groupFoldersByKind([
      folder({ id: "u", name: "Loose", schemaId: null, documentCount: 1 }),
      folder({ id: "a", name: "NDAs", schemaId: "s2", schemaName: "Zeta", attributes: [nda], preparationState: "ready" }),
      folder({ id: "b", name: "MSAs", schemaId: "s1", schemaName: "Alpha", attributes: [nda], preparationState: "ready" }),
    ]);
    expect(groups.map((g) => g.schemaId)).toEqual(["s1", "s2", null]);
    expect(groups[2].hasSchema).toBe(false);
    expect(groups[2].folderIds).toEqual(["u"]);
  });

  it("marks a kind with no fields as not set up even when a schema id is present", () => {
    const groups = groupFoldersByKind([
      folder({ id: "a", schemaId: "s1", schemaName: "Empty", attributes: [] }),
    ]);
    expect(groups[0].hasSchema).toBe(false);
  });

  it("is prepared when any folder of the set has prepared data", () => {
    const groups = groupFoldersByKind([
      folder({ id: "a", schemaId: "s1", attributes: [nda], preparationState: "not_prepared" }),
      folder({ id: "b", schemaId: "s1", attributes: [nda], preparationState: "needs_updating" }),
    ]);
    expect(groups[0].prepared).toBe(true);
  });

  it("is not prepared when no folder of the set has prepared data", () => {
    const groups = groupFoldersByKind([
      folder({ id: "a", schemaId: "s1", attributes: [nda], preparationState: "not_prepared" }),
      folder({ id: "b", schemaId: "s1", attributes: [nda], preparationState: "no_documents" }),
    ]);
    expect(groups[0].prepared).toBe(false);
  });

  it("adopts the kind's fields and name from the first folder that carries them", () => {
    const groups = groupFoldersByKind([
      folder({ id: "a", schemaId: "s1", schemaName: null, attributes: [] }),
      folder({ id: "b", schemaId: "s1", schemaName: "Agreements", attributes: [nda] }),
    ]);
    expect(groups[0].attributes).toEqual([nda]);
    expect(groups[0].schemaName).toBe("Agreements");
  });
});

describe("aggregatePreparationState", () => {
  it("returns no_schema for an empty set", () => {
    expect(aggregatePreparationState([])).toBe("no_schema");
  });

  it("lets needs_updating win over ready (the cautionary truth)", () => {
    expect(aggregatePreparationState(["ready", "needs_updating"])).toBe("needs_updating");
  });

  it("returns ready when all prepared and none stale", () => {
    expect(aggregatePreparationState(["ready", "ready"])).toBe("ready");
  });

  it("surfaces not_prepared over no_documents", () => {
    expect(aggregatePreparationState(["no_documents", "not_prepared"])).toBe("not_prepared");
  });
});
