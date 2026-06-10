import { describe, expect, it } from "vitest";

import { C4L_CONNECTORS } from "@/lib/connections/providers/c4l-connector-catalog";
import {
  deriveMcpTrustTier,
  isTrustedFirstPartyServer,
  listConnectorCatalogByCategory,
  listFirstPartyServersByProvider,
  selfHostedServerId,
} from "@/lib/connections/providers/mcp-registry";

/**
 * The security-critical trust invariant (D-089): trust is DERIVED from the code
 * registry + the connect path, never stored. A first-party registry id wins
 * regardless of path; a self-hosted id via the self-hosted path is self_hosted;
 * anything else is untrusted. Crucially, a forged/unknown id can NEVER derive
 * first_party.
 */
describe("deriveMcpTrustTier", () => {
  it("derives first_party for a registry server, regardless of the self-hosted-path flag", () => {
    expect(deriveMcpTrustTier("google-drive-mcp", false)).toBe("first_party");
    expect(deriveMcpTrustTier("google-drive-mcp", true)).toBe("first_party");
    expect(deriveMcpTrustTier("google-gmail-mcp", false)).toBe("first_party");
    expect(deriveMcpTrustTier("google-calendar-mcp", false)).toBe("first_party");
  });

  it("derives self_hosted for a self-hosted id via the self-hosted path", () => {
    const id = selfHostedServerId("https://mcp.acme.com");
    expect(deriveMcpTrustTier(id, true)).toBe("self_hosted");
  });

  it("derives untrusted for an unknown id not via the self-hosted path", () => {
    expect(deriveMcpTrustTier("totally-unknown-server", false)).toBe("untrusted");
  });

  it("NEVER derives first_party for a forged/unknown id (registry-wins invariant)", () => {
    // Via the self-hosted path, a forged id is at most self_hosted — never first_party.
    expect(deriveMcpTrustTier("forged-google-drive-mcp", true)).toBe(
      "self_hosted",
    );
    // Off the self-hosted path, a forged id is untrusted — never first_party.
    expect(deriveMcpTrustTier("forged-google-drive-mcp", false)).toBe(
      "untrusted",
    );
  });

  it("derives first_party for every harvested catalog connector (registry membership)", () => {
    for (const connector of C4L_CONNECTORS) {
      expect(isTrustedFirstPartyServer(connector.serverId)).toBe(true);
      expect(deriveMcpTrustTier(connector.serverId, false)).toBe("first_party");
    }
  });
});

/**
 * The catalog integration invariants: the harvested connectors join the
 * registry as configured, connectable entries grouped for both surfaces (the
 * org connector UI's families and the platform catalog's categories), with
 * Google's verified entries intact and the catalog entries honestly
 * pre-seeded.
 */
describe("connector catalog in the registry", () => {
  it("keeps the three Google Workspace servers, verified, in their own family", () => {
    const groups = listFirstPartyServersByProvider();
    const google = groups.find((g) => g.provider === "google-workspace");
    expect(google?.servers.map((s) => s.serverId).sort()).toEqual([
      "google-calendar-mcp",
      "google-drive-mcp",
      "google-gmail-mcp",
    ]);

    const catalog = listConnectorCatalogByCategory();
    const googleEntries = catalog
      .flatMap((c) => c.entries)
      .filter((e) => e.serverId.startsWith("google-"));
    expect(googleEntries).toHaveLength(3);
    for (const entry of googleEntries) expect(entry.status).toBe("verified");
  });

  it("lists every catalog connector as configured (real endpoint) with its description and access note", () => {
    const groups = listFirstPartyServersByProvider();
    const byId = new Map(
      groups.flatMap((g) => g.servers).map((s) => [s.serverId, s]),
    );
    for (const connector of C4L_CONNECTORS) {
      const info = byId.get(connector.serverId);
      expect(info).toBeDefined();
      expect(info!.configured).toBe(true);
      expect(info!.description).toBe(connector.description);
      expect(info!.accessNote).toBe(connector.accessNote);
    }
  });

  it("groups the platform catalog by category, every entry carrying provenance", () => {
    const catalog = listConnectorCatalogByCategory();
    const entries = catalog.flatMap((c) => c.entries);
    // 3 Google + the harvested connectors, no duplicates.
    expect(entries).toHaveLength(3 + C4L_CONNECTORS.length);
    expect(new Set(entries.map((e) => e.serverId)).size).toBe(entries.length);
    for (const entry of entries) {
      expect(entry.provenance.sourceLabel.length).toBeGreaterThan(0);
      expect(entry.provenance.sourceUrl.startsWith("https://")).toBe(true);
      expect(entry.endpoint.startsWith("https://")).toBe(true);
    }
    // Every harvested entry pins the upstream commit it was vetted from.
    for (const entry of entries.filter((e) => !e.serverId.startsWith("google-"))) {
      expect(entry.provenance.commit).toMatch(/^[0-9a-f]{40}$/);
    }
  });
});
