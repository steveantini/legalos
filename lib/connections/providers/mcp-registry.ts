import "server-only";

import {
  C4L_CONNECTOR_SOURCE,
  C4L_CONNECTORS,
  CONNECTOR_CATEGORIES,
  type C4LConnector,
  type ConnectorAuthModel,
  type ConnectorCatalogStatus,
  type ConnectorCategoryKey,
} from "@/lib/connections/providers/c4l-connector-catalog";
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
// Two sources, one allowlist:
//
//   1. Google's official Workspace MCP servers — Drive, Gmail, and Calendar —
//      the first trusted surface, verified live end to end (D-106). OAuth 2.1
//      with a pre-registered static client, reusing the PKCE/TokenBundle
//      substrate.
//   2. The Claude for Legal connector catalog (c4l-connector-catalog.ts): the
//      legal-system connectors harvested from Anthropic's published plugin
//      configs, pre-vetted against their connector criteria. Each is a
//      pre-seeded, DISABLED-BY-DEFAULT entry — registry membership only; an
//      org's super admin still connects it with the org's own credentials
//      through the governed flow, and its catalog `status` says honestly
//      whether legalOS has live-verified it yet.
//
// The `discoveryBaseUrl` values are Google's official GLOBAL MCP server endpoints,
// confirmed verbatim from Google's own documentation/console (the authoritative
// first-party source, not the open web where community Workspace MCP servers
// dominate). The allowlist is the hard ceiling on what can touch privileged data,
// so its entries must be real, vendor-official endpoints — and must not include
// servers the vendor does not offer: Google provides no dedicated Docs or Sheets
// MCP server, so neither is listed (Drive's create_file covers creating those
// files). Trust still derives from registry MEMBERSHIP, never from the URL — a
// wrong URL fails to connect, it never becomes trusted. A future provider added
// before its endpoint is confirmed can use the TBC placeholder (below), which the
// connector UI renders honestly as "available once configured" until set.
//
// serverId is suffixed '-mcp' so an MCP connection's provider_id is distinct from
// the existing OAuth Drive adapter's provider_id ('google-drive'); the two kinds
// coexist as separate connections. capabilityCategory is a descriptive 'mcp'
// label (not yet a governed connection-policy category, like 'models' in 1b).

// Placeholder origin for a future provider added before its real endpoint is
// confirmed; the connector UI shows such an entry as "available once configured".
// Google's endpoints are now real (above), so nothing uses this today.
const TBC = "https://TO-BE-CONFIRMED.invalid";

/**
 * Display families for first-party servers. The connector UI (2c) groups
 * servers into expand/collapse families so the list stays scannable as the
 * registry grows. Google Workspace is a vendor family (its three servers share
 * one OAuth client and one vendor); the catalog connectors group by their
 * CONNECTOR_CATEGORIES key, since most are one server per vendor and a legal
 * buyer scans by kind of system ("our e-discovery tools"), not by vendor. Key
 * order is the display order. `provider` on an entry is its family key,
 * distinct from a server's `providerId` (which is its own serverId on the
 * connection row).
 */
const FIRST_PARTY_PROVIDERS: Record<
  string,
  { label: string; descriptor: string }
> = {
  "google-workspace": {
    label: "Google Workspace",
    descriptor: "Drive, Gmail, and Calendar.",
  },
  ...CONNECTOR_CATEGORIES,
  // Future vendor families ('microsoft-365', ...) slot in alongside.
};

/**
 * Catalog metadata every first-party entry carries, so the platform catalog
 * surface and the org connector UI render status, provenance, and the honest
 * access note from the registry itself (one source, no sidecar copy maps).
 */
export type ConnectorCatalogMeta = {
  /** One-line user-facing description (product register, no em dashes). */
  description: string;
  /** Display-taxonomy category (a CONNECTOR_CATEGORIES key). */
  category: ConnectorCategoryKey;
  /** Honest verification state: pre-seeded vs proven live by legalOS. */
  status: ConnectorCatalogStatus;
  /** How the server authenticates (every current entry is OAuth 2.1). */
  authModel: ConnectorAuthModel;
  /** Where the entry was vetted from. */
  provenance: {
    /** Short source label, e.g. "Anthropic, Claude for Legal". */
    sourceLabel: string;
    /** The source's canonical URL. */
    sourceUrl: string;
    /** C4L plugin slugs shipping it (empty for non-C4L entries). */
    plugins: string[];
    /** Upstream commit at harvest time, when the source is a repo. */
    commit?: string;
  };
  /** What an org needs for this connector to be useful (account, workspace, or free). */
  accessNote: string;
};

/** A first-party registry entry: the adapter plus display, family, and catalog metadata. */
type FirstPartyServerEntry = McpServerAdapter & {
  displayName: string;
  /** The display FAMILY key (a FIRST_PARTY_PROVIDERS key), for grouping. */
  provider: string;
  /** Catalog metadata (status, provenance, category, access note). */
  catalog: ConnectorCatalogMeta;
};

function firstPartyEntry(
  serverId: string,
  displayName: string,
  provider: string,
  // Catalog metadata (status, provenance, category, access note); see
  // ConnectorCatalogMeta. Required: every allowlist entry must say where it was
  // vetted from and whether it has been proven live.
  catalog: ConnectorCatalogMeta,
  // The server's official OAuth-discovery base URL (the vendor's MCP endpoint).
  // Defaults to the TBC placeholder so a provider added before its endpoint is
  // confirmed renders honestly as "available once configured" (the connector UI's
  // configured flag keys off this). Trust is registry membership, never this URL.
  discoveryBaseUrl: string = TBC,
  // How this server's OAuth client is obtained (D-097). Defaults to dynamic (RFC
  // 7591) so a DCR-capable first-party server needs no extra wiring; servers
  // without DCR (Google) pass an explicit `static` acquisition with their env key.
  clientAcquisition: McpClientAcquisition = { mode: "dynamic" },
  // The OAuth scopes the server requires, declared in the authorization request
  // (D-099). Empty ⇒ no scope parameter (the dynamic/self-hosted default).
  scopes: string[] = [],
): FirstPartyServerEntry {
  return {
    kind: "mcp",
    serverId,
    providerId: serverId, // for MCP adapters, providerId mirrors serverId
    capabilityCategory: "mcp",
    displayName,
    provider,
    catalog,
    clientAcquisition,
    scopes,
    discoveryBaseUrl,
  };
}

const GOOGLE = "google-workspace";

// Google's Workspace MCP servers do NOT support RFC 7591 dynamic client
// registration, so they connect with a client PRE-REGISTERED in the Google Cloud
// console. All three share one Google OAuth client, so they share one env-var pair
// (GOOGLE_MCP_OAUTH_CLIENT_ID / GOOGLE_MCP_OAUTH_CLIENT_SECRET) — deliberately
// SEPARATE from the Drive data-source connector's GOOGLE_OAUTH_* pair, since the
// MCP client is registered with different scopes and the MCP callback redirect URI
// (D-097). The values live only in env; nothing here holds a credential.
const GOOGLE_MCP_CLIENT: McpClientAcquisition = {
  mode: "static",
  credentialKey: "GOOGLE_MCP_OAUTH",
};

// The OAuth scopes each Google Workspace MCP server requires, sourced VERBATIM
// from Google's official MCP configuration docs
// (developers.google.com/workspace/guides/configure-mcp-servers). They are
// least-privilege (readonly plus file/compose, not full access) and are declared
// in the authorization request because Google (a static authorization server)
// requires explicit scopes up front — discovery does not supply them here (D-099).
// The operator must mirror these on the Google Cloud consent screen's Data Access
// page; the two must match for consent to succeed.
const GOOGLE_DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.file",
];
const GOOGLE_GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
];
const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.freebusy",
  "https://www.googleapis.com/auth/calendar.events.readonly",
];

// Google's catalog provenance: the endpoints and scopes were confirmed verbatim
// from Google's official MCP configuration docs (D-098/D-099), and the full
// path — connect, tool discovery, live agent reads — was proven end to end
// (D-106), so all three carry `status: "verified"`. Note the Claude for Legal
// plugin configs ship Google Drive at this SAME endpoint; the harvest deduped
// it against this entry rather than duplicating it.
const GOOGLE_DOCS_URL =
  "https://developers.google.com/workspace/guides/configure-mcp-servers";

function googleCatalogMeta(description: string): ConnectorCatalogMeta {
  return {
    description,
    category: "productivity",
    status: "verified",
    authModel: "oauth",
    provenance: {
      sourceLabel: "Google, official Workspace MCP documentation",
      sourceUrl: GOOGLE_DOCS_URL,
      plugins: [],
    },
    accessNote: "Requires a Google Workspace account.",
  };
}

/**
 * Translate a harvested Claude for Legal catalog connector into a first-party
 * registry entry. The endpoint is the vendor's official MCP server, verbatim
 * from the upstream config; the OAuth client is acquired by dynamic
 * registration (the remote-MCP default; CourtListener's authorization server
 * confirmed DCR live). Display family = the catalog category, so the org
 * connector UI groups these by kind of system.
 */
function fromCatalogConnector(connector: C4LConnector): FirstPartyServerEntry {
  return {
    kind: "mcp",
    serverId: connector.serverId,
    providerId: connector.serverId,
    capabilityCategory: "mcp",
    displayName: connector.displayName,
    provider: connector.category,
    catalog: {
      description: connector.description,
      category: connector.category,
      status: connector.status,
      authModel: connector.authModel,
      provenance: {
        sourceLabel: "Anthropic, Claude for Legal",
        sourceUrl: C4L_CONNECTOR_SOURCE.repo,
        plugins: connector.plugins,
        commit: C4L_CONNECTOR_SOURCE.commit,
      },
      accessNote: connector.accessNote,
    },
    clientAcquisition: { mode: "dynamic" },
    scopes: [],
    discoveryBaseUrl: connector.endpoint,
  };
}

// Google's official global Workspace MCP server endpoints (verbatim from Google's
// own documentation/console). Google offers dedicated MCP servers for Drive,
// Gmail, and Calendar — and none for Docs or Sheets, so neither is listed here
// (Drive's create_file covers creating those files). The Claude for Legal
// connector catalog entries follow, one per harvested connector.
const TRUSTED_FIRST_PARTY_SERVERS: Record<string, FirstPartyServerEntry> = {
  "google-drive-mcp": firstPartyEntry("google-drive-mcp", "Google Drive", GOOGLE, googleCatalogMeta("Documents and files in Google Drive."), "https://drivemcp.googleapis.com/mcp/v1", GOOGLE_MCP_CLIENT, GOOGLE_DRIVE_SCOPES),
  "google-gmail-mcp": firstPartyEntry("google-gmail-mcp", "Gmail", GOOGLE, googleCatalogMeta("Email in Gmail."), "https://gmailmcp.googleapis.com/mcp/v1", GOOGLE_MCP_CLIENT, GOOGLE_GMAIL_SCOPES),
  "google-calendar-mcp": firstPartyEntry("google-calendar-mcp", "Google Calendar", GOOGLE, googleCatalogMeta("Schedules in Google Calendar."), "https://calendarmcp.googleapis.com/mcp/v1", GOOGLE_MCP_CLIENT, GOOGLE_CALENDAR_SCOPES),
  ...Object.fromEntries(
    C4L_CONNECTORS.map((connector) => [
      connector.serverId,
      fromCatalogConnector(connector),
    ]),
  ),
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
 * connection the backend cannot yet complete. `description` and `accessNote`
 * come from the entry's catalog metadata (one source; no sidecar copy map in
 * the UI). */
export type FirstPartyServerInfo = {
  serverId: string;
  displayName: string;
  configured: boolean;
  /** One-line description from the catalog metadata. */
  description: string;
  /** The honest access note (vendor account, workspace, or free). */
  accessNote: string;
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
      description: server.catalog.description,
      accessNote: server.catalog.accessNote,
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

/** One catalog entry as the platform Connectors page renders it. */
export type ConnectorCatalogEntry = {
  serverId: string;
  displayName: string;
  /** The server endpoint (the entry's discovery base URL). */
  endpoint: string;
  description: string;
  status: ConnectorCatalogStatus;
  authModel: ConnectorAuthModel;
  provenance: ConnectorCatalogMeta["provenance"];
  accessNote: string;
};

/** A catalog category with its entries, for the platform Connectors page. */
export type ConnectorCatalogCategory = {
  key: ConnectorCategoryKey;
  label: string;
  descriptor: string;
  entries: ConnectorCatalogEntry[];
};

/**
 * The full connector catalog GROUPED BY CATEGORY for the platform-owner
 * surface: every first-party registry entry (Google Workspace and the
 * harvested Claude for Legal connectors alike) with its status, provenance,
 * auth model, and endpoint. Categories follow CONNECTOR_CATEGORIES key order;
 * entries keep registry (insertion) order within a category. Pure data; no
 * secrets, no trust or endpoint change.
 */
export function listConnectorCatalogByCategory(): ConnectorCatalogCategory[] {
  const byCategory = new Map<string, ConnectorCatalogEntry[]>();
  for (const server of Object.values(TRUSTED_FIRST_PARTY_SERVERS)) {
    const entry: ConnectorCatalogEntry = {
      serverId: server.serverId,
      displayName: server.displayName,
      endpoint: server.discoveryBaseUrl,
      description: server.catalog.description,
      status: server.catalog.status,
      authModel: server.catalog.authModel,
      provenance: server.catalog.provenance,
      accessNote: server.catalog.accessNote,
    };
    const existing = byCategory.get(server.catalog.category);
    if (existing) existing.push(entry);
    else byCategory.set(server.catalog.category, [entry]);
  }

  return (Object.keys(CONNECTOR_CATEGORIES) as ConnectorCategoryKey[])
    .filter((key) => byCategory.has(key))
    .map((key) => ({
      key,
      label: CONNECTOR_CATEGORIES[key].label,
      descriptor: CONNECTOR_CATEGORIES[key].descriptor,
      entries: byCategory.get(key) ?? [],
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
