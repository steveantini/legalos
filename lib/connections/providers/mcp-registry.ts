import "server-only";

import type {
  McpServerAdapter,
  McpTrustTier,
} from "@/lib/connections/providers/types";

/**
 * The code-level trusted-MCP registry — the HARD CEILING on which MCP servers
 * can ever connect (flag 2a, D-089). This is the trust boundary as real code.
 *
 * The non-negotiable rule for privileged legal data: only (a) a first-party
 * official server registered HERE, or (b) a customer-self-hosted endpoint
 * connected through the partitioned self-hosted path, can ever connect. Arbitrary
 * third-party servers are not "blocked" — they are UNREPRESENTABLE as
 * connectable, because connectability is derived from this registry, not from any
 * stored data.
 *
 * Three guarantees this file makes legible to a future maintainer:
 *
 *   1. HARD CEILING. This compiled-in list is the universe of trusted first-party
 *      servers. Nothing in the database, no admin action, no API input, and no
 *      forged request can WIDEN it. It changes only by a deliberate, reviewed
 *      deploy. Per-org policy (2c governance) can only NARROW this set — select a
 *      subset an organization enables — never add to it.
 *
 *   2. TRUST IS DERIVED, NEVER STORED-AS-AUTHORITY. A server's trust tier is
 *      COMPUTED by deriveMcpTrustTier from this registry plus the connect path,
 *      never read as truth from a connections row. So no row, drift, bug, or
 *      tampering can make an untrusted server appear trusted. A connections row
 *      may carry a display label, but the authority is always this code.
 *
 *   3. NO UNTRUSTED CODE PATH. The MCP connect flow (2b) will gate on
 *      isTrustedFirstPartyServer at BOTH connect-initiate and callback (mirroring
 *      the OAuth isConnectionAllowed gate), plus a separate, partitioned
 *      self-hosted path. There is no third way to create an MCP connection.
 *
 * Its own registry (like model-registry.ts, not the OAuth ADAPTERS): MCP servers
 * are looked up by server identity and trust tier, never connected through the
 * OAuth routes (which reject non-'oauth' kinds, 1a).
 */

// ---------------------------------------------------------------------------
// First-party trusted servers (the hard-ceiling allowlist).
// ---------------------------------------------------------------------------
// Seeded with Google's official Workspace MCP servers (Drive, Gmail, Calendar,
// Docs, Sheets), the intended first trusted surface. These authenticate via
// OAuth 2.1 (remote servers), reusing the PKCE/TokenBundle substrate in 2b.
//
// IMPORTANT: the `discoveryBaseUrl` values below are TO-BE-CONFIRMED placeholders.
// The exact official Google Workspace MCP server endpoints are finalized in 2b
// (which builds the real connect flow and verifies them); 2a establishes the
// STRUCTURE and the trust guarantee, not the final URLs. They are deliberately
// marked here so no placeholder is ever mistaken for a verified endpoint, and
// because trust derives from registry MEMBERSHIP, not from the URL — a wrong URL
// fails to connect, it never becomes trusted.
//
// serverId is suffixed '-mcp' so an MCP connection's provider_id is distinct from
// the existing OAuth Drive adapter's provider_id ('google-drive'); the two kinds
// coexist as separate connections. capabilityCategory is a descriptive 'mcp'
// label (not yet a governed connection-policy category, like 'models' in 1b).

const TBC = "https://TO-BE-CONFIRMED-IN-2b.invalid"; // placeholder origin; finalized in 2b

function firstPartyEntry(
  serverId: string,
  displayName: string,
): McpServerAdapter & { displayName: string } {
  return {
    kind: "mcp",
    serverId,
    providerId: serverId, // for MCP adapters, providerId mirrors serverId
    capabilityCategory: "mcp",
    displayName,
    // Placeholder until 2b; trust is registry membership, never this URL.
    discoveryBaseUrl: TBC,
    // listTools is implemented in 2b (no MCP client / network in 2a).
  };
}

const TRUSTED_FIRST_PARTY_SERVERS: Record<
  string,
  McpServerAdapter & { displayName: string }
> = {
  "google-drive-mcp": firstPartyEntry("google-drive-mcp", "Google Drive"),
  "google-gmail-mcp": firstPartyEntry("google-gmail-mcp", "Gmail"),
  "google-calendar-mcp": firstPartyEntry("google-calendar-mcp", "Google Calendar"),
  "google-docs-mcp": firstPartyEntry("google-docs-mcp", "Google Docs"),
  "google-sheets-mcp": firstPartyEntry("google-sheets-mcp", "Google Sheets"),
};

/** A first-party trusted server entry, or null if the id is not on the allowlist. */
export function getTrustedMcpServer(
  serverId: string,
): (McpServerAdapter & { displayName: string }) | null {
  return TRUSTED_FIRST_PARTY_SERVERS[serverId] ?? null;
}

/**
 * Whether a server id is a registered first-party trusted server. This is the
 * un-bypassable check the MCP connect flow (2b) calls at BOTH initiate and
 * callback. Not registered here ⇒ not first-party ⇒ only the partitioned
 * self-hosted path could connect it ⇒ otherwise unconnectable.
 */
export function isTrustedFirstPartyServer(serverId: string): boolean {
  return serverId in TRUSTED_FIRST_PARTY_SERVERS;
}

/** Every first-party trusted server id, for display/enumeration (2c). */
export const TRUSTED_FIRST_PARTY_SERVER_IDS = Object.keys(
  TRUSTED_FIRST_PARTY_SERVERS,
);

/**
 * Derive an MCP server's trust tier — the ONLY place trust is decided, computed
 * from the code registry plus the connect path, NEVER read from stored data
 * (D-089).
 *
 *   - first_party: the server is a registered allowlist entry (registry
 *     membership wins regardless of path).
 *   - self_hosted: not first-party, but connected through the partitioned
 *     customer-supplied-endpoint path (`isSelfHostedPath`), so the customer owns
 *     and trusts the server.
 *   - untrusted:   anything else. UNCONNECTABLE — the connect flow must refuse it.
 *
 * Because trust is derived here and only here, no connections row can
 * misrepresent it: a row may store a server id and a base URL, but whether that
 * server is trusted is recomputed from this registry every time.
 */
export function deriveMcpTrustTier(
  serverId: string,
  isSelfHostedPath: boolean,
): McpTrustTier {
  if (isTrustedFirstPartyServer(serverId)) return "first_party";
  if (isSelfHostedPath) return "self_hosted";
  return "untrusted";
}
