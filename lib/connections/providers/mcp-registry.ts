import "server-only";

import type {
  McpClientAcquisition,
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

/**
 * Provider families for first-party servers. The connector UI (2c) groups
 * servers by provider with expand/collapse, so the list stays scannable as
 * providers grow. Adding a provider is adding one entry here plus its servers in
 * TRUSTED_FIRST_PARTY_SERVERS (provider keyed to one of these). Key order is the
 * display order. `provider` here is the family, distinct from a server's
 * `providerId` (which is its own serverId on the connection row).
 */
const FIRST_PARTY_PROVIDERS: Record<
  string,
  { label: string; descriptor: string }
> = {
  "google-workspace": {
    label: "Google Workspace",
    descriptor: "Drive, Gmail, Calendar, Docs, and Sheets.",
  },
  // Future: 'microsoft-365' ("Microsoft 365"), 'slack' ("Slack"), etc.
};

/** A first-party registry entry: the adapter plus display + provider-family metadata. */
type FirstPartyServerEntry = McpServerAdapter & {
  displayName: string;
  /** The provider FAMILY key (a FIRST_PARTY_PROVIDERS key), for grouping. */
  provider: string;
};

function firstPartyEntry(
  serverId: string,
  displayName: string,
  provider: string,
  // How this server's OAuth client is obtained (D-097). Defaults to dynamic (RFC
  // 7591) so a DCR-capable first-party server needs no extra wiring; servers
  // without DCR (Google) pass an explicit `static` acquisition with their env key.
  clientAcquisition: McpClientAcquisition = { mode: "dynamic" },
): FirstPartyServerEntry {
  return {
    kind: "mcp",
    serverId,
    providerId: serverId, // for MCP adapters, providerId mirrors serverId
    capabilityCategory: "mcp",
    displayName,
    provider,
    clientAcquisition,
    // Placeholder until 2b; trust is registry membership, never this URL.
    discoveryBaseUrl: TBC,
    // listTools is implemented in 2b (no MCP client / network in 2a).
  };
}

const GOOGLE = "google-workspace";

// Google's Workspace MCP servers do NOT support RFC 7591 dynamic client
// registration, so they connect with a client PRE-REGISTERED in the Google Cloud
// console. All five share one Google OAuth client, so they share one env-var pair
// (GOOGLE_MCP_OAUTH_CLIENT_ID / GOOGLE_MCP_OAUTH_CLIENT_SECRET) — deliberately
// SEPARATE from the Drive data-source connector's GOOGLE_OAUTH_* pair, since the
// MCP client is registered with different scopes and the MCP callback redirect URI
// (D-097). The values live only in env; nothing here holds a credential.
const GOOGLE_MCP_CLIENT: McpClientAcquisition = {
  mode: "static",
  credentialKey: "GOOGLE_MCP_OAUTH",
};

const TRUSTED_FIRST_PARTY_SERVERS: Record<string, FirstPartyServerEntry> = {
  "google-drive-mcp": firstPartyEntry("google-drive-mcp", "Google Drive", GOOGLE, GOOGLE_MCP_CLIENT),
  "google-gmail-mcp": firstPartyEntry("google-gmail-mcp", "Gmail", GOOGLE, GOOGLE_MCP_CLIENT),
  "google-calendar-mcp": firstPartyEntry("google-calendar-mcp", "Google Calendar", GOOGLE, GOOGLE_MCP_CLIENT),
  "google-docs-mcp": firstPartyEntry("google-docs-mcp", "Google Docs", GOOGLE, GOOGLE_MCP_CLIENT),
  "google-sheets-mcp": firstPartyEntry("google-sheets-mcp", "Google Sheets", GOOGLE, GOOGLE_MCP_CLIENT),
};

/** A first-party trusted server entry, or null if the id is not on the allowlist. */
export function getTrustedMcpServer(
  serverId: string,
): (McpServerAdapter & { displayName: string }) | null {
  return TRUSTED_FIRST_PARTY_SERVERS[serverId] ?? null;
}

/** A pre-registered (static) OAuth client's credentials, read from env. */
export type McpStaticClient = { clientId: string; clientSecret: string };

/**
 * Resolve a static server's PRE-REGISTERED OAuth client credentials from env
 * (D-097). `credentialKey` names the env-var pair by convention:
 * `{credentialKey}_CLIENT_ID` and `{credentialKey}_CLIENT_SECRET`. Returns null
 * if either is unset or blank, so the caller can fail the connect cleanly rather
 * than proceeding with an empty client.
 *
 * Server-only (reads env); never returns or logs which var was missing, only the
 * null/non-null result, so a misconfiguration can't leak the env-var layout.
 */
export function resolveMcpStaticClient(
  credentialKey: string,
): McpStaticClient | null {
  const clientId = process.env[`${credentialKey}_CLIENT_ID`]?.trim();
  const clientSecret = process.env[`${credentialKey}_CLIENT_SECRET`]?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
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

/** One first-party server as the connector UI lists it. `configured` is false
 * while the entry still holds the to-be-confirmed placeholder endpoint, so the UI
 * presents it honestly as "available once configured" rather than implying a
 * connection the backend cannot yet complete. */
export type FirstPartyServerInfo = {
  serverId: string;
  displayName: string;
  configured: boolean;
};

/** First-party servers grouped under one provider family, for the UI's
 * expand/collapse provider groups. */
export type FirstPartyProviderGroup = {
  provider: string;
  providerLabel: string;
  providerDescriptor: string;
  servers: FirstPartyServerInfo[];
};

/**
 * The first-party trusted servers GROUPED BY PROVIDER family for the connector UI
 * (2c). Groups follow FIRST_PARTY_PROVIDERS key order; each server keeps its id,
 * display name, and configured state. Built so the list stays scannable as
 * providers grow (Google Workspace today; Microsoft 365, Slack, and others slot
 * in as added entries). Pure data; no secrets, no trust/endpoint change.
 */
export function listFirstPartyServersByProvider(): FirstPartyProviderGroup[] {
  const byProvider = new Map<string, FirstPartyServerInfo[]>();
  for (const server of Object.values(TRUSTED_FIRST_PARTY_SERVERS)) {
    const info: FirstPartyServerInfo = {
      serverId: server.serverId,
      displayName: server.displayName,
      // The placeholder origin (see TBC above) marks a not-yet-confirmed endpoint.
      configured: !server.discoveryBaseUrl.includes("TO-BE-CONFIRMED"),
    };
    const existing = byProvider.get(server.provider);
    if (existing) existing.push(info);
    else byProvider.set(server.provider, [info]);
  }

  return Object.keys(FIRST_PARTY_PROVIDERS)
    .filter((provider) => byProvider.has(provider))
    .map((provider) => ({
      provider,
      providerLabel: FIRST_PARTY_PROVIDERS[provider].label,
      providerDescriptor: FIRST_PARTY_PROVIDERS[provider].descriptor,
      servers: byProvider.get(provider) ?? [],
    }));
}

// ---------------------------------------------------------------------------
// Self-hosted server identity (the second trusted tier, flag 2b-ii-3).
// ---------------------------------------------------------------------------
// A self-hosted MCP connection is a customer-supplied server the customer runs.
// Its server id is the customer URL's origin under a reserved prefix that NO
// first-party registry id uses (registry ids are 'google-*-mcp'), so the two id
// namespaces are disjoint and can never collide or be mistaken for one another.
// The prefix is the in-band marker of "came through the self-hosted path"; trust
// is still DERIVED (deriveMcpTrustTier), never read from a stored value.

/** The reserved prefix for self-hosted server ids; disjoint from every registry id. */
export const SELF_HOSTED_SERVER_ID_PREFIX = "self-hosted:";

/** The stable self-hosted server id for a customer URL's origin. */
export function selfHostedServerId(origin: string): string {
  return `${SELF_HOSTED_SERVER_ID_PREFIX}${origin}`;
}

/** Whether a server id is a self-hosted id (vs a first-party registry id). */
export function isSelfHostedServerId(serverId: string): boolean {
  return serverId.startsWith(SELF_HOSTED_SERVER_ID_PREFIX);
}

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
