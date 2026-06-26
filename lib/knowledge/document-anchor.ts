import type { RemoteEntry } from "@/lib/knowledge/enumeration-parse";

/**
 * Row shaping for the canonical document anchor (Structured Query, commit 1).
 *
 * The sync writes two linked rows per enumerated file: a canonical `documents`
 * anchor keyed (organization_id, connection_id, external_id) so a file shared
 * across collections is one record (extracted once, no drift), and the
 * `collection_documents` inventory row that points at it. These builders are
 * pure (entries in, row objects out) so the identity tuple and the
 * anchor-linking are unit-tested without a database; the server action wires
 * the Supabase upserts around them.
 */

/** A canonical `documents` anchor row, as upserted on its identity key. */
export type AnchorUpsertRow = {
  organization_id: string;
  connection_id: string;
  external_id: string;
  title: string;
  mime_type: string;
  size_bytes: number | null;
  modified_at_source: string | null;
  source_url: string | null;
  last_seen_at: string;
};

/**
 * One `collection_documents` row as the sync upserts it. `document_id` (the
 * anchor link) is optional so the same shape covers both the anchored write and
 * the pre-migration legacy fallback, where the column does not exist yet.
 */
export type InventoryUpsertRow = {
  collection_id: string;
  collection_source_id: string;
  external_id: string;
  title: string;
  mime_type: string;
  size_bytes: number | null;
  modified_at_source: string | null;
  source_url: string | null;
  last_seen_at: string;
  status: "present";
  document_id?: string | null;
};

/** Canonical anchor rows for a page of files read through one connection. */
export function buildAnchorRows(
  organizationId: string,
  connectionId: string,
  entries: RemoteEntry[],
  nowIso: string,
): AnchorUpsertRow[] {
  return entries.map((entry) => ({
    organization_id: organizationId,
    connection_id: connectionId,
    external_id: entry.id,
    title: entry.name,
    mime_type: entry.mimeType ?? "",
    size_bytes: entry.sizeBytes,
    modified_at_source: entry.modifiedAt,
    source_url: entry.url,
    last_seen_at: nowIso,
  }));
}

/**
 * Inventory rows for a page of files. When `anchorIdByExternalId` is provided,
 * each row is linked to its anchor (`document_id`); a file missing from the map
 * links to null rather than silently dropping. When it is null (the anchor is
 * unavailable pre-migration), `document_id` is omitted entirely so the row
 * matches the legacy column set.
 */
export function buildInventoryRows(
  collectionId: string,
  sourceId: string,
  entries: RemoteEntry[],
  nowIso: string,
  anchorIdByExternalId: Map<string, string> | null,
): InventoryUpsertRow[] {
  return entries.map((entry) => ({
    collection_id: collectionId,
    collection_source_id: sourceId,
    external_id: entry.id,
    title: entry.name,
    mime_type: entry.mimeType ?? "",
    size_bytes: entry.sizeBytes,
    modified_at_source: entry.modifiedAt,
    source_url: entry.url,
    last_seen_at: nowIso,
    status: "present",
    ...(anchorIdByExternalId
      ? { document_id: anchorIdByExternalId.get(entry.id) ?? null }
      : {}),
  }));
}
