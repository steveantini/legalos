import {
  C4L_CONNECTORS,
} from "@/lib/connections/providers/c4l-connector-catalog";

/**
 * Connector drift detection — the diff between the upstream Claude for Legal
 * `.mcp.json` connector configs and the shipped connector catalog
 * (c4l-connector-catalog.ts), run by the platform refresh alongside the
 * existing content-drift report (D-112 idiom: detection automated, action
 * human).
 *
 * NEVER auto-applied, by design: the catalog feeds the trusted-MCP registry,
 * the compiled-in trust ceiling (D-089), and a catalog change — above all an
 * ENDPOINT change — is security-relevant. Drift is reported for deliberate,
 * vetted action (a reviewed code change), exactly as content drift is
 * reported but never written.
 *
 * Pure module: string/struct in, report out. The network reads live in
 * c4l-fetch (the refresh's existing fetch pass picks up the `.mcp.json`
 * files); this module owns parsing, harvest-consistent dedupe, and the diff.
 */

/** One connector as one upstream plugin's `.mcp.json` declares it. */
export type UpstreamConnectorEntry = {
  /** The plugin slug whose config declares it. */
  plugin: string;
  /** Display name: the entry's `title`, falling back to its object key. */
  name: string;
  /** The server URL, verbatim. */
  url: string;
  /** Whether the entry declares an explicit pre-registered OAuth client. */
  hasExplicitOAuthClient: boolean;
};

/** One distinct upstream connector after harvest-consistent dedupe. */
export type UpstreamConnector = {
  name: string;
  url: string;
  /** Every plugin slug shipping this (name, url) pair. */
  plugins: string[];
  hasExplicitOAuthClient: boolean;
};

/**
 * Parse one plugin's `.mcp.json` into upstream connector entries. Tolerant:
 * malformed JSON, a missing `mcpServers` object, or an entry without an
 * https URL yields no entries (a refresh must never fail on one bad file).
 */
export function parseUpstreamMcpConfig(
  plugin: string,
  raw: string,
): UpstreamConnectorEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null) return [];
  const servers = (parsed as { mcpServers?: unknown }).mcpServers;
  if (typeof servers !== "object" || servers === null) return [];

  const entries: UpstreamConnectorEntry[] = [];
  for (const [key, value] of Object.entries(servers as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) continue;
    const server = value as { url?: unknown; title?: unknown; oauth?: unknown };
    const url = typeof server.url === "string" ? server.url.trim() : "";
    if (!url.startsWith("https://")) continue;
    const title = typeof server.title === "string" ? server.title.trim() : "";
    entries.push({
      plugin,
      name: title || key,
      url,
      hasExplicitOAuthClient:
        typeof server.oauth === "object" && server.oauth !== null,
    });
  }
  return entries;
}

/**
 * Dedupe upstream entries the way the harvest did: one connector per distinct
 * (name, url) pair, accumulating the plugins that ship it. Sorted by name for
 * stable reporting.
 */
export function dedupeUpstreamConnectors(
  entries: UpstreamConnectorEntry[],
): UpstreamConnector[] {
  const byKey = new Map<string, UpstreamConnector>();
  for (const entry of entries) {
    const key = `${normalizeName(entry.name)}::${entry.url}`;
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.plugins.includes(entry.plugin)) {
        existing.plugins.push(entry.plugin);
      }
      existing.hasExplicitOAuthClient =
        existing.hasExplicitOAuthClient || entry.hasExplicitOAuthClient;
    } else {
      byKey.set(key, {
        name: entry.name,
        url: entry.url,
        plugins: [entry.plugin],
        hasExplicitOAuthClient: entry.hasExplicitOAuthClient,
      });
    }
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** A catalog-side row the diff compares against. */
export type CatalogComparisonRow = {
  /** Display name (matched case-insensitively against upstream names). */
  name: string;
  /** The shipped endpoint, verbatim. */
  endpoint: string;
  /** Whether legalOS has live-verified this connector (re-verify on change). */
  verified: boolean;
  /**
   * Whether this row exists in our registry ON C4L'S AUTHORITY. False for
   * rows we ship on another authority (Google Drive): those still match
   * upstream entries (so they never report as ADDED) and still report
   * endpoint changes, but their disappearance upstream is not a REMOVED —
   * our registry does not depend on C4L shipping them.
   */
  c4lProvenance: boolean;
};

/** An upstream connector that is upstream-only by deliberate decision. */
export type ExcludedUpstreamConnector = {
  /** The upstream name, matched case-insensitively. */
  name: string;
  /** Why it is excluded (rendered nowhere today; recorded for the report data). */
  reason: string;
};

/**
 * The shipped catalog as the diff compares it: every harvested connector,
 * plus Google Drive — which C4L ships at the SAME endpoint as our verified
 * `google-drive-mcp` registry entry (the harvest's dedupe). The Drive
 * endpoint literal is cross-checked against the registry by test, so the
 * two cannot silently diverge.
 */
export function shippedCatalogComparisonRows(): CatalogComparisonRow[] {
  return [
    ...C4L_CONNECTORS.map((connector) => ({
      name: connector.displayName,
      endpoint: connector.endpoint,
      verified: connector.status === "verified",
      c4lProvenance: true,
    })),
    {
      name: "Google Drive",
      endpoint: "https://drivemcp.googleapis.com/mcp/v1",
      verified: true,
      c4lProvenance: false,
    },
  ];
}

/**
 * Upstream connectors deliberately NOT in the catalog. CoCounsel
 * (external_plugins/cocounsel-legal) is deferred per D-051; it lands in the
 * catalog when a customer brings a Thomson Reuters subscription.
 */
export const EXCLUDED_UPSTREAM_CONNECTORS: ReadonlyArray<ExcludedUpstreamConnector> =
  [
    {
      name: "cocounsel-legal",
      reason:
        "Deferred per D-051; joins the catalog when a customer brings a Thomson Reuters subscription.",
    },
  ];

/** A connector present upstream and absent from the catalog. */
export type AddedConnector = {
  name: string;
  url: string;
  plugins: string[];
};

/** A catalog connector (C4L provenance) no longer shipped upstream. */
export type RemovedConnector = {
  name: string;
  endpoint: string;
  /** Verified entries removed upstream still deserve a deliberate look. */
  verified: boolean;
};

/** A connector present on both sides with a meaningful difference. */
export type ChangedConnector = {
  name: string;
  /** SECURITY-RELEVANT: the upstream endpoint differs from the shipped one. */
  endpointChanged?: { from: string; to: string };
  /** Upstream renamed the connector but kept its endpoint. */
  renamedTo?: string;
  /** A human-readable auth-shape difference (e.g. an explicit OAuth client appeared). */
  authChanged?: string;
  /** True when the shipped entry is live-verified: a change warrants re-verification. */
  verified: boolean;
};

/** The full drift report the refresh surfaces. Empty arrays = no drift. */
export type ConnectorDrift = {
  added: AddedConnector[];
  removed: RemovedConnector[];
  changed: ChangedConnector[];
  /** Upstream names skipped by deliberate decision (see EXCLUDED_UPSTREAM_CONNECTORS). */
  excluded: string[];
};

/** Whether a drift report carries anything needing review. */
export function hasConnectorDrift(drift: ConnectorDrift): boolean {
  return (
    drift.added.length > 0 ||
    drift.removed.length > 0 ||
    drift.changed.length > 0
  );
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Diff upstream connectors against catalog rows. Matching is by normalized
 * name; a same-endpoint name mismatch is folded into CHANGED as a rename
 * (rather than a spurious removed + added pair). Pure; the convenience
 * wrapper below binds the shipped catalog.
 */
export function diffConnectorEntries(
  upstream: UpstreamConnector[],
  catalog: CatalogComparisonRow[],
  excluded: ReadonlyArray<ExcludedUpstreamConnector> = EXCLUDED_UPSTREAM_CONNECTORS,
): ConnectorDrift {
  const excludedNames = new Set(excluded.map((e) => normalizeName(e.name)));
  const catalogByName = new Map(catalog.map((row) => [normalizeName(row.name), row]));
  const upstreamByName = new Map(
    upstream.map((connector) => [normalizeName(connector.name), connector]),
  );

  const excludedSeen: string[] = [];
  const added: AddedConnector[] = [];
  const changed: ChangedConnector[] = [];

  for (const connector of upstream) {
    const key = normalizeName(connector.name);
    if (excludedNames.has(key)) {
      excludedSeen.push(connector.name);
      continue;
    }
    const row = catalogByName.get(key);
    if (!row) {
      added.push({
        name: connector.name,
        url: connector.url,
        plugins: [...connector.plugins].sort(),
      });
      continue;
    }
    const entry: ChangedConnector = { name: row.name, verified: row.verified };
    if (connector.url !== row.endpoint) {
      entry.endpointChanged = { from: row.endpoint, to: connector.url };
    }
    if (connector.hasExplicitOAuthClient) {
      // Every shipped entry authenticates via discovery-backed OAuth without
      // a pre-registered client, so an explicit client block appearing
      // upstream is an auth-shape change worth a look.
      entry.authChanged =
        "Upstream now declares a pre-registered OAuth client for this connector.";
    }
    if (entry.endpointChanged || entry.authChanged) changed.push(entry);
  }

  const removed: RemovedConnector[] = [];
  for (const row of catalog) {
    if (!row.c4lProvenance) continue;
    if (upstreamByName.has(normalizeName(row.name))) continue;

    // Same endpoint under a new upstream name = a rename, not removed+added.
    const renamed = added.findIndex((a) => a.url === row.endpoint);
    if (renamed >= 0) {
      const [renamedEntry] = added.splice(renamed, 1);
      changed.push({
        name: row.name,
        renamedTo: renamedEntry.name,
        verified: row.verified,
      });
      continue;
    }

    removed.push({
      name: row.name,
      endpoint: row.endpoint,
      verified: row.verified,
    });
  }

  return { added, removed, changed, excluded: excludedSeen.sort() };
}

/** Diff upstream connectors against the SHIPPED catalog (the refresh's call). */
export function diffConnectorCatalog(
  upstream: UpstreamConnector[],
): ConnectorDrift {
  return diffConnectorEntries(upstream, shippedCatalogComparisonRows());
}
