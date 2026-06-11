import "server-only";

import { getCurrentUserProfile } from "@/lib/auth/access";
import { getOrgMcpExecutionTargets } from "@/lib/connections/mcp/connection-state";
import {
  canServerEnumerate,
  getTrustedMcpServer,
} from "@/lib/connections/providers/mcp-registry";
import { hasEnumerationAdapter } from "@/lib/knowledge/enumeration";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
  const [{ data, error }, connectionDisplay] = await Promise.all([
    supabase
      .from("collections")
      .select(
        `id, name, description, visibility, last_synced_at,
         collection_sources(id, connection_id, root_reference, display_path, recursive, last_synced_at),
         collection_departments(department_id, departments(name))`,
      )
      .order("created_at", { ascending: true }),
    getConnectionDisplayMap(organizationId),
  ]);
  if (error || !data) return [];

  const rows = data as unknown as CollectionRow[];

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
