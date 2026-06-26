"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  getCurrentUserProfile,
  isCurrentUserSuperAdmin,
  requireAuthUser,
} from "@/lib/auth/access";
import { getTrustedMcpServer } from "@/lib/connections/providers/mcp-registry";
import type {
  BrowseResult,
  CollectionActionResult,
  CollectionInput,
  SourceInput,
  SyncResult,
} from "@/lib/knowledge/collections-shared";
import {
  computeDisplayPath,
  listRemoteFolderChildren,
  type EnumerationTarget,
} from "@/lib/knowledge/enumeration";
import {
  collectionSchemaInputSchema,
  type CollectionSchemaInput,
} from "@/lib/knowledge/collection-schema";
import {
  buildAnchorRows,
  buildInventoryRows,
} from "@/lib/knowledge/document-anchor";
import { resolveEnumerationTarget } from "@/lib/knowledge/targets";
import {
  advanceCollectionPreparation,
  type PrepareSegmentResult,
} from "@/lib/knowledge/extraction/engine";
import {
  runSyncSegment,
  type SyncCursor,
  type SyncSource,
} from "@/lib/knowledge/sync";
import {
  isUndefinedColumnError,
  isUndefinedTableError,
} from "@/lib/supabase/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server actions for Knowledge collections (Step 1): the super-admin CRUD,
 * the live folder browser the source picker drives, and the segmented
 * inventory sync. Every action re-checks super admin at the application
 * layer (the RLS policies of migration 0070 re-enforce at the database — the
 * established double-gate), and every repository read goes through the org's
 * governed MCP connection with custody-resolved tokens. The sync persists
 * METADATA ONLY: titles, types, sizes, timestamps, links — never content.
 */

const COLLECTIONS_PATH = "/workspace/knowledge/collections";
const NOT_ALLOWED = "Only super admins can manage collections.";
const GENERIC_ERROR = "Something went wrong. Please try again.";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const uuid = z.string().uuid();

const collectionInputSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1, "Name is required.").max(120),
  description: z.string().trim().max(600).default(""),
  visibility: z.enum(["org", "departments"]),
  departmentIds: z.array(uuid).max(50).default([]),
});

const remoteIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,128}$/, "Invalid folder reference.");

const sourceInputSchema = z.object({
  collectionId: uuid,
  connectionId: uuid,
  rootReference: remoteIdSchema,
  pathNames: z.array(z.string().trim().min(1).max(200)).max(16),
  recursive: z.boolean(),
});

const browseInputSchema = z.object({
  connectionId: uuid,
  folderId: remoteIdSchema.nullable(),
  pageToken: z.string().max(4000).nullable(),
});

const syncCursorSchema = z.object({
  sourceIndex: z.number().int().min(0),
  queue: z.array(remoteIdSchema).max(10000),
  pageToken: z.string().max(4000).nullable(),
  sourceSyncStartedAt: z.string().datetime(),
  documentsSeen: z.number().int().min(0),
  foldersWalked: z.number().int().min(0),
});

const syncInputSchema = z.object({
  collectionId: uuid,
  cursor: syncCursorSchema.nullable(),
  /** Snapshot of source ids the cursor was minted against (order matters). */
  sourceIds: z.array(uuid).max(100).nullable(),
});

const prepareInputSchema = z.object({
  collectionId: uuid,
  /** Documents this run already tried and could not read, carried so the
   * client-driven loop advances past them instead of retrying forever. */
  failedDocumentIds: z.array(uuid).max(5000).nullable(),
});

// ---------------------------------------------------------------------------
// Collection CRUD
// ---------------------------------------------------------------------------

/** Create or update a collection (super admin). */
export async function saveCollection(
  input: CollectionInput,
): Promise<CollectionActionResult> {
  await requireAuthUser();
  if (!(await isCurrentUserSuperAdmin())) {
    return { ok: false, error: NOT_ALLOWED };
  }
  const parsed = collectionInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }
  const { id, name, description, visibility, departmentIds } = parsed.data;
  if (visibility === "departments" && departmentIds.length === 0) {
    return {
      ok: false,
      error: "Pick at least one department, or make it visible to everyone.",
    };
  }

  const profile = await getCurrentUserProfile();
  if (!profile?.organization_id) return { ok: false, error: GENERIC_ERROR };

  const supabase = await createSupabaseServerClient();

  let collectionId = id ?? null;
  if (collectionId) {
    const { error } = await supabase
      .from("collections")
      .update({ name, description, visibility })
      .eq("id", collectionId);
    if (error) return { ok: false, error: GENERIC_ERROR };
  } else {
    const { data, error } = await supabase
      .from("collections")
      .insert({
        organization_id: profile.organization_id,
        name,
        description,
        visibility,
        created_by_user_id: profile.id,
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: GENERIC_ERROR };
    collectionId = (data as { id: string }).id;
  }

  // Department visibility rows mirror the chosen mode exactly: replace the
  // set for 'departments', clear it for 'org'.
  const { error: clearError } = await supabase
    .from("collection_departments")
    .delete()
    .eq("collection_id", collectionId);
  if (clearError) return { ok: false, error: GENERIC_ERROR };
  if (visibility === "departments") {
    const { error: insertError } = await supabase
      .from("collection_departments")
      .insert(
        departmentIds.map((departmentId) => ({
          collection_id: collectionId,
          department_id: departmentId,
        })),
      );
    if (insertError) return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(COLLECTIONS_PATH);
  return { ok: true, collectionId };
}

/** Delete a collection and (by cascade) its sources and inventory. */
export async function deleteCollection(
  collectionId: string,
): Promise<CollectionActionResult> {
  await requireAuthUser();
  if (!(await isCurrentUserSuperAdmin())) {
    return { ok: false, error: NOT_ALLOWED };
  }
  if (!uuid.safeParse(collectionId).success) {
    return { ok: false, error: GENERIC_ERROR };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("collections")
    .delete()
    .eq("id", collectionId);
  if (error) return { ok: false, error: GENERIC_ERROR };
  revalidatePath(COLLECTIONS_PATH);
  return { ok: true };
}

/**
 * Define (create or replace) a collection's schema — the set of attributes
 * Structured Query will later extract (super admin). Nothing is extracted here;
 * this persists the definition only.
 *
 * One row per collection (UNIQUE collection_id). We branch insert/update
 * explicitly rather than upsert so `version` increments meaningfully (an edit is
 * traceable, the Workflows-style versioning) and created_by_user_id is preserved
 * across edits. The attributes are validated at this write boundary with the
 * shared zod schema; the RLS policy of migration 20260626120000 re-enforces the
 * super-admin-in-org rule at the database (the established double-gate).
 */
export async function saveCollectionSchema(
  input: CollectionSchemaInput,
): Promise<CollectionActionResult> {
  await requireAuthUser();
  if (!(await isCurrentUserSuperAdmin())) {
    return { ok: false, error: NOT_ALLOWED };
  }
  const parsed = collectionSchemaInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the attributes and try again.",
    };
  }
  const { collectionId, attributes } = parsed.data;

  const profile = await getCurrentUserProfile();
  if (!profile?.organization_id) return { ok: false, error: GENERIC_ERROR };

  const supabase = await createSupabaseServerClient();

  // Confirm the collection is one this admin's org can see (RLS scopes the read
  // to the org). This both fences cross-tenant writes and yields a clean error.
  const { data: collection, error: collectionError } = await supabase
    .from("collections")
    .select("id")
    .eq("id", collectionId)
    .maybeSingle();
  if (collectionError) return { ok: false, error: GENERIC_ERROR };
  if (!collection) return { ok: false, error: "Collection not found." };

  const { data: existing, error: readError } = await supabase
    .from("collection_schemas")
    .select("id, version")
    .eq("collection_id", collectionId)
    .maybeSingle();
  if (readError) return { ok: false, error: GENERIC_ERROR };

  if (existing) {
    const { error } = await supabase
      .from("collection_schemas")
      .update({
        attributes,
        version: ((existing as { version: number }).version ?? 1) + 1,
      })
      .eq("id", (existing as { id: string }).id);
    if (error) return { ok: false, error: GENERIC_ERROR };
  } else {
    const { error } = await supabase.from("collection_schemas").insert({
      collection_id: collectionId,
      organization_id: profile.organization_id,
      attributes,
      created_by_user_id: profile.id,
    });
    if (error) return { ok: false, error: GENERIC_ERROR };
  }

  revalidatePath(COLLECTIONS_PATH);
  return { ok: true, collectionId };
}

// ---------------------------------------------------------------------------
// Sources + the folder browser
// ---------------------------------------------------------------------------

/** Browse one page of a remote folder (the source picker; super admin). */
export async function browseSourceFolder(input: {
  connectionId: string;
  folderId: string | null;
  pageToken: string | null;
}): Promise<BrowseResult> {
  await requireAuthUser();
  if (!(await isCurrentUserSuperAdmin())) {
    return { ok: false, error: NOT_ALLOWED };
  }
  const parsed = browseInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };

  const target = await resolveEnumerationTarget(parsed.data.connectionId);
  if (!target) {
    return {
      ok: false,
      error:
        "This connection can't browse folders right now. Check it in Policy & access.",
    };
  }

  try {
    const page = await listRemoteFolderChildren(
      target,
      parsed.data.folderId,
      parsed.data.pageToken,
    );
    return {
      ok: true,
      page: {
        entries: page.entries.map((entry) => ({
          id: entry.id,
          name: entry.name,
          isFolder: entry.isFolder,
        })),
        nextPageToken: page.nextPageToken,
        documentCount: page.entries.filter((e) => !e.isFolder).length,
        folderCount: page.entries.filter((e) => e.isFolder).length,
      },
    };
  } catch {
    return {
      ok: false,
      error: "Couldn't read that folder. Try again in a moment.",
    };
  }
}

/** Add a repository folder as a collection source (super admin). */
export async function addCollectionSource(
  input: SourceInput,
): Promise<CollectionActionResult> {
  await requireAuthUser();
  if (!(await isCurrentUserSuperAdmin())) {
    return { ok: false, error: NOT_ALLOWED };
  }
  const parsed = sourceInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };

  // Eligibility is re-checked server-side; the picker's filtering is UX.
  const target = await resolveEnumerationTarget(parsed.data.connectionId);
  if (!target) {
    return {
      ok: false,
      error: "That connection can't back a collection source.",
    };
  }

  const serverName =
    getTrustedMcpServer(target.serverId)?.displayName ?? target.serverId;
  const displayPath = [serverName, ...parsed.data.pathNames].join(" / ");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("collection_sources").insert({
    collection_id: parsed.data.collectionId,
    connection_id: parsed.data.connectionId,
    root_reference: parsed.data.rootReference,
    display_path: displayPath.slice(0, 500),
    recursive: parsed.data.recursive,
  });
  if (error) return { ok: false, error: GENERIC_ERROR };

  revalidatePath(COLLECTIONS_PATH);
  return { ok: true };
}

/** Remove a source (its inventory rows cascade with it). */
export async function removeCollectionSource(
  sourceId: string,
): Promise<CollectionActionResult> {
  await requireAuthUser();
  if (!(await isCurrentUserSuperAdmin())) {
    return { ok: false, error: NOT_ALLOWED };
  }
  if (!uuid.safeParse(sourceId).success) {
    return { ok: false, error: GENERIC_ERROR };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("collection_sources")
    .delete()
    .eq("id", sourceId);
  if (error) return { ok: false, error: GENERIC_ERROR };
  revalidatePath(COLLECTIONS_PATH);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

/** Inventory upsert chunk size (PostgREST-friendly). */
const UPSERT_CHUNK = 400;

/**
 * Run one sync segment for a collection (super admin). The client loops
 * while `completed` is false, feeding the cursor back; each invocation stays
 * far inside the request budget regardless of tree size. Sources whose
 * connection isn't usable are SKIPPED and reported — their inventory is left
 * untouched (never marked missing on a walk that didn't happen).
 */
export async function syncCollection(input: {
  collectionId: string;
  cursor: SyncCursor | null;
  sourceIds: string[] | null;
}): Promise<SyncResult> {
  await requireAuthUser();
  if (!(await isCurrentUserSuperAdmin())) {
    return { ok: false, error: NOT_ALLOWED };
  }
  const parsed = syncInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };
  const { collectionId, cursor, sourceIds } = parsed.data;

  const supabase = await createSupabaseServerClient();

  // The collection's organization scopes the canonical document anchors the
  // sync materializes below (the anchor identity is org + connection +
  // external_id). RLS guarantees a super admin only reaches their own org's
  // collections, so this read both authorizes and supplies the org id.
  const { data: collectionRow, error: collectionError } = await supabase
    .from("collections")
    .select("organization_id")
    .eq("id", collectionId)
    .single();
  if (collectionError || !collectionRow) return { ok: false, error: GENERIC_ERROR };
  const organizationId = (collectionRow as { organization_id: string })
    .organization_id;

  const { data: sourceRows, error: sourcesError } = await supabase
    .from("collection_sources")
    .select("id, connection_id, root_reference, display_path, recursive")
    .eq("collection_id", collectionId)
    .order("created_at", { ascending: true });
  if (sourcesError || !sourceRows) return { ok: false, error: GENERIC_ERROR };

  const rows = sourceRows as {
    id: string;
    connection_id: string;
    root_reference: string;
    display_path: string;
    recursive: boolean;
  }[];

  // The connection a source reads through identifies the file together with
  // its external_id; the anchor upsert needs it per source.
  const connectionBySource = new Map(rows.map((r) => [r.id, r.connection_id]));

  if (rows.length === 0) {
    return {
      ok: false,
      error: "Add at least one source before syncing.",
    };
  }

  // Resolve each source's live target once; unusable sources are skipped and
  // reported honestly.
  const targets = new Map<string, EnumerationTarget>();
  const skippedSources: string[] = [];
  for (const row of rows) {
    const target = await resolveEnumerationTarget(row.connection_id);
    if (target) targets.set(row.id, target);
    else skippedSources.push(row.display_path);
  }

  const syncSources: SyncSource[] = rows
    .filter((row) => targets.has(row.id))
    .map((row) => ({
      id: row.id,
      rootReference: row.root_reference,
      recursive: row.recursive,
    }));

  if (syncSources.length === 0) {
    return {
      ok: false,
      error:
        "None of this collection's sources can be read right now. Check the connections in Policy & access.",
    };
  }

  // A cursor is only valid against the source list it was minted for; if the
  // sources changed mid-sync, restart honestly rather than walking the wrong
  // trees.
  if (cursor) {
    const expected = syncSources.map((s) => s.id);
    if (!sourceIds || sourceIds.join(",") !== expected.join(",")) {
      return {
        ok: false,
        error: "This collection's sources changed during the sync. Run sync again.",
      };
    }
  }

  const displayPathBySource = new Map(rows.map((r) => [r.id, r.display_path]));

  // Whether the canonical documents anchor is reachable. It is only absent in
  // the brief window where this code is deployed but the anchor migration has
  // not been applied yet (the operator pushes it separately). The first write
  // that hits a missing table/column flips this off and the sync falls back to
  // the pre-anchor inventory shape for the rest of the run; the next sync after
  // the migration lands materializes anchors. See lib/supabase/errors.ts.
  let anchorsAvailable = true;

  try {
    const result = await runSyncSegment(syncSources, cursor, {
      listChildren: (source, folderId, pageToken) =>
        listRemoteFolderChildren(targets.get(source.id)!, folderId, pageToken),

      upsertDocuments: async (source, entries) => {
        const nowIso = new Date().toISOString();
        const connectionId = connectionBySource.get(source.id)!;
        for (let i = 0; i < entries.length; i += UPSERT_CHUNK) {
          const slice = entries.slice(i, i + UPSERT_CHUNK);

          // 1) Canonical anchors first: one row per (org, connection,
          //    external_id), so a file shared across collections is extracted
          //    once later, never twice. Metadata is refreshed to this sync.
          //    The returned ids link the inventory rows below.
          let anchorIdByExternalId: Map<string, string> | null = null;
          if (anchorsAvailable) {
            const anchorRows = buildAnchorRows(
              organizationId,
              connectionId,
              slice,
              nowIso,
            );
            const { data, error } = await supabase
              .from("documents")
              .upsert(anchorRows, {
                onConflict: "organization_id,connection_id,external_id",
              })
              .select("id, external_id");
            if (error) {
              // Migration not applied yet: degrade to legacy inventory writes
              // for the rest of this sync rather than failing it.
              if (isUndefinedTableError(error) || isUndefinedColumnError(error)) {
                anchorsAvailable = false;
              } else {
                throw new Error("anchor write failed");
              }
            } else {
              anchorIdByExternalId = new Map(
                (data as { id: string; external_id: string }[]).map((r) => [
                  r.external_id,
                  r.id,
                ]),
              );
            }
          }

          // 2) Inventory rows, linked to their anchor when one exists.
          const chunk = buildInventoryRows(
            collectionId,
            source.id,
            slice,
            nowIso,
            anchorIdByExternalId,
          );
          let { error } = await supabase
            .from("collection_documents")
            .upsert(chunk, { onConflict: "collection_source_id,external_id" });
          // The document_id column lands with the same migration as the table,
          // so this only triggers in the same pre-migration window: retry the
          // legacy shape without the link.
          if (error && isUndefinedColumnError(error)) {
            anchorsAvailable = false;
            const legacy = chunk.map((row) => {
              const copy = { ...row };
              delete copy.document_id;
              return copy;
            });
            ({ error } = await supabase
              .from("collection_documents")
              .upsert(legacy, { onConflict: "collection_source_id,external_id" }));
          }
          if (error) throw new Error("inventory write failed");
        }
      },

      finalizeSource: async (source, watermarkIso) => {
        // Only a COMPLETED walk marks the unseen as missing (never dropped).
        await supabase
          .from("collection_documents")
          .update({ status: "missing" })
          .eq("collection_source_id", source.id)
          .eq("status", "present")
          .lt("last_seen_at", watermarkIso);

        // Recompute display provenance best-effort; keep the cached path
        // when the walk can't resolve it.
        const target = targets.get(source.id)!;
        const serverName =
          getTrustedMcpServer(target.serverId)?.displayName ?? target.serverId;
        const freshPath = await computeDisplayPath(
          target,
          serverName,
          source.rootReference,
        );
        await supabase
          .from("collection_sources")
          .update({
            last_synced_at: new Date().toISOString(),
            ...(freshPath
              ? { display_path: freshPath.slice(0, 500) }
              : { display_path: displayPathBySource.get(source.id) }),
          })
          .eq("id", source.id);
      },

      nowIso: () => new Date().toISOString(),
    });

    if (result.completed) {
      // The collection-level stamp means a FULL sync: every source walked.
      if (skippedSources.length === 0) {
        await supabase
          .from("collections")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", collectionId);
      }
      revalidatePath(COLLECTIONS_PATH);
      return {
        ok: true,
        completed: true,
        cursor: null,
        sourceIds: null,
        documentsSeen: result.documentsSeen,
        foldersWalked: result.foldersWalked,
        skippedSources,
      };
    }

    return {
      ok: true,
      completed: false,
      cursor: result.cursor,
      // The continuation must run against this exact source list; the client
      // echoes it back and the next invocation verifies before resuming.
      sourceIds: syncSources.map((source) => source.id),
      documentsSeen: result.documentsSeen,
      foldersWalked: result.foldersWalked,
      skippedSources,
    };
  } catch {
    // A failed segment leaves the inventory rows already written intact and
    // marks nothing missing — the next full sync reconciles.
    return {
      ok: false,
      error:
        "The sync hit a problem reading a source and stopped. Nothing was lost; run sync again.",
    };
  }
}

/**
 * Advance a collection's PREPARATION by one segment (super admin) — the
 * user-facing "Prepare" (first run) / "Update" (subsequent) action. Reads the
 * stale documents, extracts the schema's attributes with verified citations, and
 * stores values keyed to the document anchor. Deliberately distinct from Sync:
 * Sync refreshes the file INVENTORY, Prepare/Update refreshes the extracted
 * STRUCTURED DATA. The heavy lifting (derived staleness, the reconcile, the
 * model calls) lives in lib/knowledge/extraction/engine; this is the gate and
 * the path revalidation. The client loops it until completed, echoing back the
 * documents that could not be read so the run advances past them.
 */
export async function prepareCollection(input: {
  collectionId: string;
  failedDocumentIds: string[] | null;
}): Promise<PrepareSegmentResult> {
  await requireAuthUser();
  if (!(await isCurrentUserSuperAdmin())) {
    return { ok: false, error: NOT_ALLOWED };
  }
  const parsed = prepareInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_ERROR };

  const profile = await getCurrentUserProfile();
  if (!profile?.organization_id) return { ok: false, error: GENERIC_ERROR };

  const result = await advanceCollectionPreparation({
    collectionId: parsed.data.collectionId,
    organizationId: profile.organization_id,
    userId: profile.id,
    failedDocumentIds: parsed.data.failedDocumentIds ?? [],
  });

  // On completion, refresh so each card recomputes its derived preparation state.
  if (result.ok && result.completed) revalidatePath(COLLECTIONS_PATH);
  return result;
}
