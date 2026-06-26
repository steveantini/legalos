import { describe, expect, it } from "vitest";

import {
  buildAnchorRows,
  buildInventoryRows,
} from "@/lib/knowledge/document-anchor";
import type { RemoteEntry } from "@/lib/knowledge/enumeration-parse";

/**
 * The anchor row builders' contract: a canonical anchor carries the identity
 * tuple (org, connection, external_id) plus refreshed metadata, and inventory
 * rows link to their anchor by external_id — or omit the link entirely in the
 * pre-migration fallback. The cross-collection dedupe, the uniqueness key, and
 * upsert idempotency are enforced by the database (the unique index and the
 * backfill's DISTINCT ON in migration 20260626001554) and asserted by that
 * migration's post-apply verification queries, not here.
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

const NOW = "2026-06-26T00:15:54Z";

describe("buildAnchorRows", () => {
  it("carries the identity tuple and refreshed metadata for each entry", () => {
    const rows = buildAnchorRows("org-1", "conn-1", [doc("a"), doc("b")], NOW);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      organization_id: "org-1",
      connection_id: "conn-1",
      external_id: "a",
      title: "a.pdf",
      mime_type: "application/pdf",
      size_bytes: 100,
      modified_at_source: "2026-06-01T00:00:00Z",
      source_url: "https://example.com/a",
      last_seen_at: NOW,
    });
  });

  it("normalizes absent optional metadata (null mime to empty string)", () => {
    const entry: RemoteEntry = {
      id: "c",
      name: "c",
      isFolder: false,
      mimeType: null,
      sizeBytes: null,
      modifiedAt: null,
      url: null,
    };
    const [row] = buildAnchorRows("org-1", "conn-1", [entry], NOW);
    expect(row.mime_type).toBe("");
    expect(row.size_bytes).toBeNull();
    expect(row.modified_at_source).toBeNull();
    expect(row.source_url).toBeNull();
  });
});

describe("buildInventoryRows", () => {
  it("links each row to its anchor by external_id", () => {
    const anchorIds = new Map([
      ["a", "anchor-a"],
      ["b", "anchor-b"],
    ]);
    const rows = buildInventoryRows(
      "coll-1",
      "src-1",
      [doc("a"), doc("b")],
      NOW,
      anchorIds,
    );
    expect(rows.map((r) => r.document_id)).toEqual(["anchor-a", "anchor-b"]);
    expect(rows[0]).toMatchObject({
      collection_id: "coll-1",
      collection_source_id: "src-1",
      external_id: "a",
      status: "present",
      last_seen_at: NOW,
    });
  });

  it("links to null (never drops a row) when an anchor id is missing", () => {
    const anchorIds = new Map([["a", "anchor-a"]]);
    const rows = buildInventoryRows("coll-1", "src-1", [doc("a"), doc("b")], NOW, anchorIds);
    expect(rows).toHaveLength(2);
    expect(rows[1].external_id).toBe("b");
    expect(rows[1].document_id).toBeNull();
  });

  it("omits document_id entirely in the pre-migration fallback (anchors null)", () => {
    const rows = buildInventoryRows("coll-1", "src-1", [doc("a")], NOW, null);
    expect("document_id" in rows[0]).toBe(false);
    // The legacy column set is otherwise identical, so a pre-migration upsert
    // writes exactly today's inventory shape.
    expect(rows[0]).toEqual({
      collection_id: "coll-1",
      collection_source_id: "src-1",
      external_id: "a",
      title: "a.pdf",
      mime_type: "application/pdf",
      size_bytes: 100,
      modified_at_source: "2026-06-01T00:00:00Z",
      source_url: "https://example.com/a",
      last_seen_at: NOW,
      status: "present",
    });
  });
});
