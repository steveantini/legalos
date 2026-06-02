import "server-only";

import {
  deriveMcpTrustTier,
  isSelfHostedServerId,
} from "@/lib/connections/providers/mcp-registry";
import type {
  McpToolDescriptor,
  McpTrustTier,
} from "@/lib/connections/providers/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Read the org's MCP connections for display (flag 2b-iii) — the data the
 * connector UI (2c) renders: "Google Drive — connected, first-party trusted, 14
 * tools."
 *
 * Service-role read (mirrors the model-connection read): org MCP connections are
 * grant-less and thus super-admin-read-only under RLS, so a service-role read
 * lets the page show the state to any admin. Tolerant of the discovered_tools
 * column being absent (pre-migration) — it retries without it and reports a null
 * catalog rather than erroring.
 *
 * TRUST IS DERIVED, NEVER READ AS AUTHORITY (D-089): the trust tier is recomputed
 * from the server id here (registry-wins, then the self-hosted id namespace, else
 * untrusted), never read from a stored column. A connections row carries a server
 * id, a base URL, and the catalog, but whether the server is trusted is always
 * derived.
 */
export type OrgMcpConnection = {
  /** The MCP server id (provider_id): a first-party registry id or 'self-hosted:<origin>'. */
  serverId: string;
  /** Display label captured at connect (the server name or origin), or null. */
  label: string | null;
  /** The server URL (base_url), or null. */
  serverUrl: string | null;
  /** DERIVED on every read — never read from a stored value. */
  trustTier: McpTrustTier;
  /** active | revoked | error. */
  status: string;
  /** The tools discovered at connect, or null when not (yet) discovered. */
  tools: McpToolDescriptor[] | null;
};

type McpRow = {
  provider_id: string;
  provider_account_label: string | null;
  base_url: string | null;
  status: string;
  discovered_tools?: unknown;
};

function toConnection(row: McpRow): OrgMcpConnection {
  const serverId = row.provider_id;
  return {
    serverId,
    label: row.provider_account_label,
    serverUrl: row.base_url,
    // Derived: registry-wins, then the self-hosted id namespace, else untrusted.
    trustTier: deriveMcpTrustTier(serverId, isSelfHostedServerId(serverId)),
    status: row.status,
    tools: Array.isArray(row.discovered_tools)
      ? (row.discovered_tools as McpToolDescriptor[])
      : null,
  };
}

/**
 * The org's active MCP connections, each with its derived trust tier and stored
 * tool catalog. Returns an empty array when none (or on read failure), so the
 * caller degrades gracefully.
 */
export async function getOrgMcpConnections(): Promise<OrgMcpConnection[]> {
  const admin = createSupabaseAdminClient();

  // Try with discovered_tools; if the column is absent (pre-migration), retry
  // without it and report null catalogs rather than erroring.
  const withTools = await admin
    .from("connections")
    .select(
      "provider_id, provider_account_label, base_url, status, discovered_tools",
    )
    .eq("scope", "org")
    .is("owner_user_id", null)
    .eq("capability_category", "mcp")
    .eq("status", "active");
  if (!withTools.error && withTools.data) {
    return (withTools.data as McpRow[]).map(toConnection);
  }

  const withoutTools = await admin
    .from("connections")
    .select("provider_id, provider_account_label, base_url, status")
    .eq("scope", "org")
    .is("owner_user_id", null)
    .eq("capability_category", "mcp")
    .eq("status", "active");
  if (withoutTools.error || !withoutTools.data) return [];
  return (withoutTools.data as McpRow[]).map(toConnection);
}
