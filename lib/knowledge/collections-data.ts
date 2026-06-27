import "server-only";

import { getCurrentUserProfile } from "@/lib/auth/access";
import { getOrgMcpExecutionTargets } from "@/lib/connections/mcp/connection-state";
import {
  canServerEnumerate,
  getTrustedMcpServer,
} from "@/lib/connections/providers/mcp-registry";
import {
  parseCollectionAttributes,
  type CollectionAttribute,
} from "@/lib/knowledge/collection-schema";
import {
  deriveCollectionPreparationState,
  selectStaleExtractionWork,
  type CollectionPreparationState,
  type ExistingExtraction,
  type ExtractionDocumentRef,
} from "@/lib/knowledge/extraction/extract";
import { hasEnumerationAdapter } from "@/lib/knowledge/enumeration";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  isUndefinedColumnError,
  isUndefinedTableError,
} from "@/lib/supabase/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server-side reads for the Collections surface (Knowledge arc Step 1). All
 * reads go through the RLS-scoped per-request client, so visibility is the
 * DATABASE's answer: a department-scoped collection a user can't see simply
 * never comes back — the page renders whatever this returns without its own
 * filtering layer to drift.
 */

/** One repository source as the surface renders it. */
export type CollectionSourceView = {
  id: string;
  connectionId: string;
  serverId: string;
  serverDisplayName: string;
  rootReference: string;
  displayPath: string;
  recursive: boolean;
  /** 'active' renders normally; anything else renders honestly disabled. */
  connectionStatus: "active" | "error" | "revoked" | "disconnected";
  lastSyncedAt: string | null;
};

/** One collection as the surface renders it. */
export type CollectionView = {
  id: string;
  name: string;
  description: string;
  visibility: "org" | "departments";
  departmentIds: string[];
  departmentNames: string[];
  sources: CollectionSourceView[];
  presentCount: number;
  missingCount: number;
  lastSyncedAt: string | null;
  /**
   * The collection's Structured Query schema attributes (empty when none is
   * defined). Readable to any member who can see the collection: the
   * collection_schemas read policy composes collection visibility (Step 3a), so
   * a member querying a visible folder receives its kind's fields.
   */
  schemaAttributes: CollectionAttribute[];
  /**
   * The id and name of the KIND this collection belongs to (its shared
   * `collection_schemas` row, Step 3a), or null when no kind is assigned. Many
   * folders can point at one kind; Structured Query groups by these to ask over
   * a kind rather than a single folder.
   */
  schemaId: string | null;
  schemaName: string | null;
  /**
   * The DERIVED preparation state (Structured Query commit 3): whether the
   * collection's documents have been extracted against its current schema, and
   * whether anything is stale. Drives the Prepare / Update action label. Always
   * "no_schema" for non-admins (they never receive a schema). Computed from
   * live staleness, never a stored flag.
   */
  preparationState: CollectionPreparationState;
};

// Embed shapes the untyped server client returns, asserted at the boundary.
type SourceRow = {
  id: string;
  connection_id: string;
  root_reference: string;
  display_path: string;
  recursive: boolean;
  last_synced_at: string | null;
};

/** Non-secret connection display state, keyed by connection id. */
type ConnectionDisplay = { serverId: string; status: string };

type CollectionRow = {
  id: string;
  name: string;
  description: string;
  visibility: "org" | "departments";
  last_synced_at: string | null;
  collection_sources: SourceRow[] | null;
  collection_departments:
    | { department_id: string; departments: { name: string } | null }[]
    | null;
};

function toSourceView(
  row: SourceRow,
  connections: Map<string, ConnectionDisplay>,
): CollectionSourceView {
  const display = connections.get(row.connection_id);
  const serverId = display?.serverId ?? "";
  const status = display?.status;
  return {
    id: row.id,
    connectionId: row.connection_id,
    serverId,
    serverDisplayName:
      getTrustedMcpServer(serverId)?.displayName ??
      (serverId || "Disconnected server"),
    rootReference: row.root_reference,
    displayPath: row.display_path,
    recursive: row.recursive,
    connectionStatus:
      status === "active" || status === "error" || status === "revoked"
        ? status
        : "disconnected",
    lastSyncedAt: row.last_synced_at,
  };
}

/**
 * Non-secret display state for the org's MCP connections, keyed by
 * connection id. Service-role on purpose, mirroring getOrgMcpConnections:
 * org MCP connections are grant-less and super-admin-read-only under RLS,
 * but every member who can see a collection deserves the honest
 * connected/disconnected state of its sources. Only provider_id and status
 * leave this function — never a token reference. ORG-SCOPED (D-136): the
 * service-role read filters by the caller's organization.
 */
async function getConnectionDisplayMap(
  organizationId: string,
): Promise<Map<string, ConnectionDisplay>> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("connections")
    .select("id, provider_id, status")
    .eq("organization_id", organizationId)
    .eq("capability_category", "mcp");
  if (error || !data) return new Map();
  return new Map(
    (data as { id: string; provider_id: string; status: string }[]).map(
      (row) => [row.id, { serverId: row.provider_id, status: row.status }],
    ),
  );
}

/**
 * The org's collection schema definitions (Structured Query), keyed by
 * collection id. RLS scopes the read to admins in the org, so a non-admin gets
 * an empty map. Tolerates the pre-migration window: if collection_schemas does
 * not exist yet, this degrades to "no schemas" rather than failing the whole
 * Collections read — the same graceful degradation the anchor write uses
 * (Structured Query commit 1).
 */
/** One collection's schema as the data layer carries it: the attributes for
 * display, plus the id and version the derived-staleness computation needs. */
type SchemaEntry = {
  id: string;
  /** The kind's name (Step 3a); null in the pre-3a legacy fallback. */
  name: string | null;
  version: number;
  attributes: CollectionAttribute[];
};

/**
 * Per collection, its schema entry, resolved via the per-set `collections.schema_id`
 * pointer (Step 3a): folders sharing a schema all map to the one entry. Keyed by
 * COLLECTION id so every downstream consumer (getVisibleCollections, the
 * preparation-state derivation) is unchanged; only the resolution path moved from
 * the schema's own collection_id to the schema_id pointer. Behavior is identical
 * for a set-of-one. Tolerates the pre-migration window: if `collections.schema_id`
 * does not exist yet, it falls back to the legacy 1:1 mapping so the Knowledge
 * surfaces render correctly until the migration lands.
 */
async function getCollectionSchemaMap(): Promise<Map<string, SchemaEntry>> {
  const supabase = await createSupabaseServerClient();
  const { data: cols, error: colsError } = await supabase
    .from("collections")
    .select("id, schema_id");
  if (colsError) {
    if (isUndefinedColumnError(colsError)) {
      return getCollectionSchemaMapLegacy();
    }
    if (!isUndefinedTableError(colsError)) {
      console.error("collections schema-pointer read failed", { code: colsError.code });
    }
    return new Map();
  }

  const { data: schemas, error: schemasError } = await supabase
    .from("collection_schemas")
    .select("id, name, version, attributes");
  if (schemasError) {
    if (!isUndefinedTableError(schemasError)) {
      console.error("collection_schemas read failed", { code: schemasError.code });
    }
    return new Map();
  }
  const byId = new Map<string, SchemaEntry>(
    ((schemas ?? []) as { id: string; name: string | null; version: number; attributes: unknown }[]).map(
      (s) => [
        s.id,
        {
          id: s.id,
          name: s.name,
          version: s.version,
          attributes: parseCollectionAttributes(s.attributes),
        },
      ],
    ),
  );

  const map = new Map<string, SchemaEntry>();
  for (const c of (cols ?? []) as { id: string; schema_id: string | null }[]) {
    if (!c.schema_id) continue;
    const entry = byId.get(c.schema_id);
    if (entry) map.set(c.id, entry);
  }
  return map;
}

/** Pre-migration fallback: the legacy 1:1 mapping keyed by the schema's own
 * collection_id (before `collections.schema_id` exists). */
async function getCollectionSchemaMapLegacy(): Promise<Map<string, SchemaEntry>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("collection_schemas")
    .select("id, collection_id, version, attributes");
  if (error) {
    if (!isUndefinedTableError(error)) {
      console.error("collection_schemas read failed", { code: error.code });
    }
    return new Map();
  }
  return new Map(
    ((data ?? []) as {
      id: string;
      collection_id: string;
      version: number;
      attributes: unknown;
    }[]).map((row) => [
      row.collection_id,
      {
        id: row.id,
        name: null,
        version: row.version,
        attributes: parseCollectionAttributes(row.attributes),
      },
    ]),
  );
}

/**
 * The DERIVED preparation state for each collection that has a schema, computed
 * from live staleness (the document anchors' modified times, the existing
 * extraction rows, and the schema version). Two scoped reads total, not per
 * collection. Tolerates the pre-migration window: an absent document_extractions
 * table reads as "nothing extracted yet", so collections show "not prepared"
 * honestly until the migration lands.
 */
async function getPreparationStateMap(
  schemaMap: Map<string, SchemaEntry>,
): Promise<Map<string, CollectionPreparationState>> {
  const states = new Map<string, CollectionPreparationState>();
  const collectionIds = [...schemaMap.keys()];
  if (collectionIds.length === 0) return states;

  const supabase = await createSupabaseServerClient();

  // Present, anchored documents for these collections, with the anchor's live
  // modified time (the doc-changed staleness input).
  const { data: invData, error: invError } = await supabase
    .from("collection_documents")
    .select("collection_id, document_id, documents(modified_at_source)")
    .in("collection_id", collectionIds)
    .eq("status", "present")
    .not("document_id", "is", null);
  if (invError) {
    console.error("preparation inventory read failed", { code: invError.code });
    return states;
  }

  const docsByCollection = new Map<string, ExtractionDocumentRef[]>();
  const seenPerCollection = new Map<string, Set<string>>();
  const allDocumentIds = new Set<string>();
  for (const raw of (invData ?? []) as unknown as {
    collection_id: string;
    document_id: string;
    documents: { modified_at_source: string | null } | null;
  }[]) {
    if (!raw.document_id) continue;
    let seen = seenPerCollection.get(raw.collection_id);
    if (!seen) {
      seen = new Set();
      seenPerCollection.set(raw.collection_id, seen);
    }
    if (seen.has(raw.document_id)) continue;
    seen.add(raw.document_id);
    allDocumentIds.add(raw.document_id);
    const list = docsByCollection.get(raw.collection_id) ?? [];
    // Only documentId and modifiedAtSource matter to staleness; the rest are
    // placeholders (the engine loads full refs when it actually extracts).
    list.push({
      documentId: raw.document_id,
      externalId: "",
      title: "",
      connectionId: "",
      sourceUrl: null,
      modifiedAtSource: raw.documents?.modified_at_source ?? null,
    });
    docsByCollection.set(raw.collection_id, list);
  }

  // Existing extraction rows for those documents (the freshness inputs).
  const existingByDocId = new Map<string, ExistingExtraction[]>();
  if (allDocumentIds.size > 0) {
    const { data: exData, error: exError } = await supabase
      .from("document_extractions")
      .select(
        "document_id, attribute_key, document_modified_at_source, extracted_against_schema_version, source_collection_schema_id",
      )
      .in("document_id", [...allDocumentIds]);
    if (exError) {
      if (!isUndefinedTableError(exError)) {
        console.error("document_extractions read failed", { code: exError.code });
      }
      // Absent table → no extractions; states fall to "not prepared" honestly.
    } else {
      for (const row of (exData ?? []) as {
        document_id: string;
        attribute_key: string;
        document_modified_at_source: string | null;
        extracted_against_schema_version: number;
        source_collection_schema_id: string | null;
      }[]) {
        const list = existingByDocId.get(row.document_id) ?? [];
        list.push({
          documentId: row.document_id,
          attributeKey: row.attribute_key,
          documentModifiedAtSource: row.document_modified_at_source,
          extractedAgainstSchemaVersion: row.extracted_against_schema_version,
          sourceCollectionSchemaId: row.source_collection_schema_id,
        });
        existingByDocId.set(row.document_id, list);
      }
    }
  }

  for (const [collectionId, schema] of schemaMap) {
    const documents = docsByCollection.get(collectionId) ?? [];
    const existing = documents.flatMap(
      (doc) => existingByDocId.get(doc.documentId) ?? [],
    );
    const staleWork = selectStaleExtractionWork(
      documents,
      schema.attributes,
      schema.id,
      schema.version,
      existing,
    );
    states.set(
      collectionId,
      deriveCollectionPreparationState({
        documentCount: documents.length,
        attributeCount: schema.attributes.length,
        staleWork,
        existingCount: existing.length,
      }),
    );
  }
  return states;
}

/**
 * Every collection visible to the current user (RLS decides), with sources,
 * department visibility, and inventory counts. Counts run as two cheap
 * head-only count queries per collection — fine at admin-drawn scale (tens
 * of collections); a grouped view is the upgrade path if that ever grows.
 */
export async function getVisibleCollections(): Promise<CollectionView[]> {
  const profile = await getCurrentUserProfile();
  const organizationId = profile?.organization_id;
  if (!organizationId) return [];

  const supabase = await createSupabaseServerClient();
  const [{ data, error }, connectionDisplay, schemaMap] = await Promise.all([
    supabase
      .from("collections")
      .select(
        `id, name, description, visibility, last_synced_at,
         collection_sources(id, connection_id, root_reference, display_path, recursive, last_synced_at),
         collection_departments(department_id, departments(name))`,
      )
      .order("created_at", { ascending: true }),
    getConnectionDisplayMap(organizationId),
    getCollectionSchemaMap(),
  ]);
  if (error || !data) return [];

  const rows = data as unknown as CollectionRow[];
  // The derived preparation state for collections that carry a schema (two
  // scoped reads), so each card shows Prepare / Update / Ready honestly.
  const preparationStates = await getPreparationStateMap(schemaMap);

  return Promise.all(
    rows.map(async (row) => {
      const [present, missing] = await Promise.all([
        supabase
          .from("collection_documents")
          .select("id", { count: "exact", head: true })
          .eq("collection_id", row.id)
          .eq("status", "present"),
        supabase
          .from("collection_documents")
          .select("id", { count: "exact", head: true })
          .eq("collection_id", row.id)
          .eq("status", "missing"),
      ]);

      const departmentRows = row.collection_departments ?? [];
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        visibility: row.visibility,
        departmentIds: departmentRows.map((d) => d.department_id),
        departmentNames: departmentRows
          .map((d) => d.departments?.name)
          .filter((name): name is string => Boolean(name))
          .sort(),
        sources: (row.collection_sources ?? []).map((source) =>
          toSourceView(source, connectionDisplay),
        ),
        presentCount: present.count ?? 0,
        missingCount: missing.count ?? 0,
        lastSyncedAt: row.last_synced_at,
        schemaAttributes: schemaMap.get(row.id)?.attributes ?? [],
        schemaId: schemaMap.get(row.id)?.id ?? null,
        schemaName: schemaMap.get(row.id)?.name ?? null,
        preparationState: preparationStates.get(row.id) ?? "no_schema",
      };
    }),
  );
}

/** A connected server that can back a collection source. */
export type EligibleSourceConnection = {
  connectionId: string;
  serverId: string;
  displayName: string;
};

/**
 * The org's connected, healthy, enumeration-capable servers — the only
 * things the source picker offers. Eligibility = the catalog's vetted
 * `canEnumerate` flag AND an implemented enumeration adapter AND an active
 * connection with a server URL.
 */
export async function getEligibleSourceConnections(): Promise<
  EligibleSourceConnection[]
> {
  const profile = await getCurrentUserProfile();
  const organizationId = profile?.organization_id;
  if (!organizationId) return [];

  const targets = await getOrgMcpExecutionTargets(organizationId);
  return targets
    .filter(
      (target) =>
        target.serverUrl !== null &&
        canServerEnumerate(target.serverId) &&
        hasEnumerationAdapter(target.serverId),
    )
    .map((target) => ({
      connectionId: target.connectionId,
      serverId: target.serverId,
      displayName:
        getTrustedMcpServer(target.serverId)?.displayName ?? target.serverId,
    }));
}

/** The org's active departments, for the visibility picker (admin only). */
export async function getOrgDepartmentsForPicker(): Promise<
  { id: string; name: string }[]
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("departments")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data as { id: string; name: string }[];
}
