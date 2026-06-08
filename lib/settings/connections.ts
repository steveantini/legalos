import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server-side connection-state reads over the connection data model (migration
 * 0044): `connections`, `connection_grants`, `connection_policy`. Server-only
 * (imports the per-request Supabase server client); do not import into client
 * components.
 *
 * No connection rows exist until OAuth ships in a later milestone, so every
 * read here returns the honest empty state today. The queries are real: when
 * OAuth creates rows, these flip to live with no code change.
 *
 * Capability vocabulary and the provider_id / capability_category values are
 * the typed mirror of the DB. provider_id and capability_category values must
 * stay in sync with the ids in `connections-data.ts` (the UI source of truth);
 * the DB stores them as free text, the app speaks the same vocabulary.
 */

/** Connection ownership scope. Mirrors the DB `scope` check. */
export type ConnectionScope = "personal" | "org";

/** Connection lifecycle state. Mirrors the DB `status` check. */
export type ConnectionStatus = "active" | "revoked" | "error";

/**
 * The controlled capability vocabulary, mirroring the DB CHECK constraint on
 * `connection_grants.capabilities` (`<@ array['read','write']`). Extensible:
 * automation capabilities (trigger, route, notify, ...) are added here and to
 * the CHECK constraint together when that layer ships.
 */
export type Capability = "read" | "write";

/** A row of `connections`. */
export type Connection = {
  id: string;
  provider_id: string;
  capability_category: string;
  scope: ConnectionScope;
  owner_user_id: string | null;
  created_by_user_id: string | null;
  token_ref: string | null;
  status: ConnectionStatus;
  provider_account_label: string | null;
  created_at: string;
  updated_at: string;
};

/** A row of `connection_grants`. */
export type ConnectionGrant = {
  id: string;
  connection_id: string;
  grantee_user_id: string;
  capabilities: Capability[];
  granted_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

/** A `connection_policy` row — one per organization (0066). */
export type ConnectionPolicy = {
  organization_id: string;
  allowed_categories: string[];
  allowed_providers: string[];
  default_capability_ceiling: Capability[];
  updated_by_user_id: string | null;
  updated_at: string;
};

/** A provider the user has a connection to, with their granted capabilities. */
export type ProviderConnectionState = {
  /**
   * The connection row id. The Connections page needs it to target a
   * disconnect; the OAuth callback (a later milestone) is what creates the row.
   */
  connectionId: string;
  providerId: string;
  capabilityCategory: string;
  status: ConnectionStatus;
  capabilities: Capability[];
  /** The connected account's display label (e.g. the email), or null. */
  accountLabel: string | null;
};

// Shape of the grant-plus-connection embed returned by the queries below. The
// server client is untyped, so the query result is asserted to this shape at
// the boundary. connection_grants.connection_id is a single FK, so the
// embedded `connections` is one object (not an array).
type GrantWithConnection = {
  capabilities: string[] | null;
  connections: {
    id: string;
    provider_id: string;
    capability_category: string;
    status: ConnectionStatus;
    provider_account_label: string | null;
  };
};

/**
 * Whether `userId` can use an active connection in the given capability
 * category. "Can use" means the user has a grant on a connection in that
 * category (a personal connection's owner holds a self-grant; org connections
 * grant each user explicitly), and the connection's status is active. Reads
 * via the grant the user holds, so a super admin's governance read-all does
 * not make their own gates report connected.
 */
export async function hasActiveConnectionInCategory(
  userId: string,
  category: string,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("connection_grants")
    .select("connection_id, connections!inner(capability_category, status)")
    .eq("grantee_user_id", userId)
    .eq("connections.capability_category", category)
    .eq("connections.status", "active")
    .limit(1);

  // Fail safe to "not connected" on any error (matches the gate's honest
  // default and keeps the home resilient).
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

/**
 * The user's connection state per provider, the query the Connections page
 * will consume to render real status once OAuth populates rows. Returns the
 * honest empty array today (no rows). Each entry is a provider the user holds
 * a grant on, with the connection's status and the user's granted capabilities.
 */
export async function getConnectionStates(
  userId: string,
): Promise<ProviderConnectionState[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("connection_grants")
    .select(
      "capabilities, connections!inner(id, provider_id, capability_category, status, provider_account_label)",
    )
    .eq("grantee_user_id", userId);

  if (error || !data) return [];

  // The untyped server client infers the embedded `connections` as an array,
  // but a single FK (connection_grants.connection_id) returns one object at
  // runtime, so assert through unknown to the true shape.
  return (data as unknown as GrantWithConnection[]).map((row) => ({
    connectionId: row.connections.id,
    providerId: row.connections.provider_id,
    capabilityCategory: row.connections.capability_category,
    status: row.connections.status,
    capabilities: (row.capabilities ?? []) as Capability[],
    accountLabel: row.connections.provider_account_label,
  }));
}
