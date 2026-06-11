"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  getCurrentUserProfile,
  isCurrentUserSuperAdmin,
  requireAuthUser,
} from "@/lib/auth/access";
import { getOrgMcpExecutionTargets } from "@/lib/connections/mcp/connection-state";
import {
  canServerEnumerate,
  getTrustedMcpServer,
} from "@/lib/connections/providers/mcp-registry";
import { getUsableAccessToken } from "@/lib/connections/tokens";
import type {
  BrowseResult,
  CollectionActionResult,
  CollectionInput,
  SourceInput,
  SyncResult,
} from "@/lib/knowledge/collections-shared";
import {
  computeDisplayPath,
  hasEnumerationAdapter,
  listRemoteFolderChildren,
  type EnumerationTarget,
} from "@/lib/knowledge/enumeration";
import {
  runSyncSegment,
  type SyncCursor,
  type SyncSource,
} from "@/lib/knowledge/sync";
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

// ---------------------------------------------------------------------------
// Sources + the folder browser
// ---------------------------------------------------------------------------

/**
 * Resolve a connection id to a live enumeration target: the connection must
 * be the org's, active, on an enumeration-capable catalog server with an
 * implemented adapter. Token custody stays in the established path.
 */
async function resolveEnumerationTarget(
  connectionId: string,
): Promise<EnumerationTarget | null> {
  const profile = await getCurrentUserProfile();
  if (!profile?.organization_id) return null;
  const targets = await getOrgMcpExecutionTargets(profile.organization_id);
  const target = targets.find((t) => t.connectionId === connectionId);
  if (
    !target ||
    !target.serverUrl ||
    !canServerEnumerate(target.serverId) ||
    !hasEnumerationAdapter(target.serverId)
  ) {
    return null;
  }
  try {
    const accessToken = await getUsableAccessToken(
      target.connectionId,
      target.tokenRef,
    );
    return { serverId: target.serverId, serverUrl: target.serverUrl, accessToken };
  } catch {
    return null;
  }
}

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

  try {
    const result = await runSyncSegment(syncSources, cursor, {
      listChildren: (source, folderId, pageToken) =>
        listRemoteFolderChildren(targets.get(source.id)!, folderId, pageToken),

      upsertDocuments: async (source, entries) => {
        const nowIso = new Date().toISOString();
        for (let i = 0; i < entries.length; i += UPSERT_CHUNK) {
          const chunk = entries.slice(i, i + UPSERT_CHUNK).map((entry) => ({
            collection_id: collectionId,
            collection_source_id: source.id,
            external_id: entry.id,
            title: entry.name,
            mime_type: entry.mimeType ?? "",
            size_bytes: entry.sizeBytes,
            modified_at_source: entry.modifiedAt,
            source_url: entry.url,
            last_seen_at: nowIso,
            status: "present",
          }));
          const { error } = await supabase
            .from("collection_documents")
            .upsert(chunk, { onConflict: "collection_source_id,external_id" });
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
