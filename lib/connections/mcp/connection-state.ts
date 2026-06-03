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

/**
 * An org MCP connection resolved to what the agentic tool-use loop needs to ROUTE
 * and EXECUTE a tool call (Phase 2, 2P-1). This is the sibling to OrgMcpConnection:
 * that type is display-shaped (label, status) for the connector UI; this one adds
 * the two fields the loop requires and the UI doesn't — the connectionId and the
 * tokenRef — so a later step can call getUsableAccessToken(connectionId, tokenRef)
 * and then callMcpServerTool against serverUrl. trustTier is still DERIVED.
 */
export type OrgMcpExecutionTarget = {
  /** The MCP server id (provider_id): a first-party registry id or 'self-hosted:<origin>'. */
  serverId: string;
  /** The connections row id — passed to getUsableAccessToken to mint a fresh token. */
  connectionId: string;
  /** The connection_secrets reference (connections.token_ref) — the loop's token handle. */
  tokenRef: string;
  /** The server URL (base_url) the MCP client connects to; null only if unset. */
  serverUrl: string | null;
  /** DERIVED on every read — never read from a stored value (D-089). */
  trustTier: McpTrustTier;
  /** The tools discovered at connect, or null when not (yet) discovered. */
  tools: McpToolDescriptor[] | null;
};

/** A connections row as the execution-target reader selects it. */
type McpExecutionRow = {
  id: string;
  provider_id: string;
  token_ref: string | null;
  base_url: string | null;
  discovered_tools?: unknown;
};

/**
 * Map a row to an execution target, or null when it can't be executed. A row with
 * no token_ref has no credential handle, so it is dropped rather than returned as
 * an un-executable target (the type guarantees a non-null tokenRef to callers).
 */
function toExecutionTarget(row: McpExecutionRow): OrgMcpExecutionTarget | null {
  if (!row.token_ref) return null;
  const serverId = row.provider_id;
  return {
    serverId,
    connectionId: row.id,
    tokenRef: row.token_ref,
    serverUrl: row.base_url,
    // Derived: registry-wins, then the self-hosted id namespace, else untrusted.
    trustTier: deriveMcpTrustTier(serverId, isSelfHostedServerId(serverId)),
    tools: Array.isArray(row.discovered_tools)
      ? (row.discovered_tools as McpToolDescriptor[])
      : null,
  };
}

/**
 * The org's active MCP connections resolved to execution targets (Phase 2, 2P-1).
 * Each carries the connectionId + tokenRef + serverUrl the tool-use loop needs to
 * mint a token and call the server, plus the derived trust tier and tool catalog.
 * Returns an empty array when none (or on read failure), so the caller degrades.
 *
 * Org scoping: this reads only `scope='org'`, owner-less, mcp, active connections —
 * the platform's single-tenant org boundary, the same scoping getOrgMcpConnections
 * and getOrgModelConnectionState use. The `connections` table has NO organization_id
 * column today (single-tenant by design), so there is deliberately no organizationId
 * parameter: a param implying an org filter the schema can't honor would be a false,
 * security-relevant contract on a service-role reader that returns token references.
 * When the multi-tenant-ready migration adds connections.organization_id, add an
 * organizationId parameter and an `.eq('organization_id', organizationId)` filter
 * here; the call site (the 2P-6 loop) then threads agent.organization_id through.
 *
 * Service-role: org MCP connections are grant-less and RLS-forced, and the token
 * reference points into the service-role-only connection_secrets, so this reads via
 * the admin client (the same divergence the Drive token path already uses). It
 * returns only references (connectionId, tokenRef), never a decrypted token.
 *
 * Nothing calls this yet — it is scaffolding under the locked Phase 2 design
 * (D-100); the agentic loop (2P-6) is its first consumer.
 */
export async function getOrgMcpExecutionTargets(): Promise<
  OrgMcpExecutionTarget[]
> {
  const admin = createSupabaseAdminClient();

  // Tolerant of discovered_tools being absent (pre-migration), mirroring
  // getOrgMcpConnections: try with the column, fall back without it (null catalog).
  const withTools = await admin
    .from("connections")
    .select("id, provider_id, token_ref, base_url, discovered_tools")
    .eq("scope", "org")
    .is("owner_user_id", null)
    .eq("capability_category", "mcp")
    .eq("status", "active")
    .not("token_ref", "is", null);
  if (!withTools.error && withTools.data) {
    return (withTools.data as McpExecutionRow[])
      .map(toExecutionTarget)
      .filter((t): t is OrgMcpExecutionTarget => t !== null);
  }

  const withoutTools = await admin
    .from("connections")
    .select("id, provider_id, token_ref, base_url")
    .eq("scope", "org")
    .is("owner_user_id", null)
    .eq("capability_category", "mcp")
    .eq("status", "active")
    .not("token_ref", "is", null);
  if (withoutTools.error || !withoutTools.data) return [];
  return (withoutTools.data as McpExecutionRow[])
    .map(toExecutionTarget)
    .filter((t): t is OrgMcpExecutionTarget => t !== null);
}
