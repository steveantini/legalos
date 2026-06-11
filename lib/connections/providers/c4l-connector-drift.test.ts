import { describe, expect, it } from "vitest";

import { C4L_CONNECTORS } from "@/lib/connections/providers/c4l-connector-catalog";
import {
  dedupeUpstreamConnectors,
  diffConnectorCatalog,
  diffConnectorEntries,
  hasConnectorDrift,
  parseUpstreamMcpConfig,
  shippedCatalogComparisonRows,
  type UpstreamConnector,
} from "@/lib/connections/providers/c4l-connector-drift";

/** The upstream state exactly mirroring the shipped catalog (no drift). */
function upstreamMatchingCatalog(): UpstreamConnector[] {
  const fromCatalog = C4L_CONNECTORS.map((connector) => ({
    name: connector.displayName,
    url: connector.endpoint,
    plugins: [...connector.plugins],
    hasExplicitOAuthClient: false,
  }));
  const drive = shippedCatalogComparisonRows().find(
    (row) => row.name === "Google Drive",
  )!;
  return [
    ...fromCatalog,
    { name: "Google Drive", url: drive.endpoint, plugins: ["commercial-legal"], hasExplicitOAuthClient: false },
    // CoCounsel ships upstream but is deliberately excluded from the catalog.
    {
      name: "cocounsel-legal",
      url: "https://legal-mcp.thomsonreuters.com/mcp",
      plugins: ["cocounsel-legal"],
      hasExplicitOAuthClient: true,
    },
  ];
}

describe("parseUpstreamMcpConfig", () => {
  it("parses entries with title, url, and the explicit-oauth hint", () => {
    const raw = JSON.stringify({
      mcpServers: {
        Ironclad: {
          type: "http",
          url: "https://mcp.na1.ironcladapp.com/mcp",
          title: "Ironclad",
        },
        "cocounsel-legal": {
          type: "http",
          url: "https://legal-mcp.thomsonreuters.com/mcp",
          oauth: { clientId: "abc" },
        },
      },
    });
    const entries = parseUpstreamMcpConfig("commercial-legal", raw);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      plugin: "commercial-legal",
      name: "Ironclad",
      url: "https://mcp.na1.ironcladapp.com/mcp",
      hasExplicitOAuthClient: false,
    });
    // No title falls back to the object key; the oauth block is the hint.
    expect(entries[1].name).toBe("cocounsel-legal");
    expect(entries[1].hasExplicitOAuthClient).toBe(true);
  });

  it("tolerates malformed JSON, missing mcpServers, and non-https urls", () => {
    expect(parseUpstreamMcpConfig("p", "not json")).toEqual([]);
    expect(parseUpstreamMcpConfig("p", "{}")).toEqual([]);
    expect(
      parseUpstreamMcpConfig(
        "p",
        JSON.stringify({ mcpServers: { Bad: { url: "http://insecure" } } }),
      ),
    ).toEqual([]);
  });
});

describe("dedupeUpstreamConnectors", () => {
  it("merges the same (name, url) across plugins, accumulating plugins", () => {
    const deduped = dedupeUpstreamConnectors([
      { plugin: "a", name: "Slack", url: "https://mcp.slack.com/mcp", hasExplicitOAuthClient: false },
      { plugin: "b", name: "Slack", url: "https://mcp.slack.com/mcp", hasExplicitOAuthClient: false },
    ]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].plugins).toEqual(["a", "b"]);
  });

  it("keeps the same name at a different url as a distinct connector", () => {
    const deduped = dedupeUpstreamConnectors([
      { plugin: "a", name: "Slack", url: "https://mcp.slack.com/mcp", hasExplicitOAuthClient: false },
      { plugin: "b", name: "Slack", url: "https://other.slack.com/mcp", hasExplicitOAuthClient: false },
    ]);
    expect(deduped).toHaveLength(2);
  });
});

describe("diffConnectorCatalog", () => {
  it("reports no drift when upstream mirrors the shipped catalog", () => {
    const drift = diffConnectorCatalog(upstreamMatchingCatalog());
    expect(drift.added).toEqual([]);
    expect(drift.removed).toEqual([]);
    expect(drift.changed).toEqual([]);
    expect(hasConnectorDrift(drift)).toBe(false);
    // The deliberate exclusion is data, not drift.
    expect(drift.excluded).toEqual(["cocounsel-legal"]);
  });

  it("reports an upstream connector missing from the catalog as added", () => {
    const upstream = [
      ...upstreamMatchingCatalog(),
      {
        name: "Relativity",
        url: "https://mcp.relativity.com/mcp",
        plugins: ["litigation-legal"],
        hasExplicitOAuthClient: false,
      },
    ];
    const drift = diffConnectorCatalog(upstream);
    expect(drift.added).toEqual([
      {
        name: "Relativity",
        url: "https://mcp.relativity.com/mcp",
        plugins: ["litigation-legal"],
      },
    ]);
    expect(hasConnectorDrift(drift)).toBe(true);
  });

  it("reports a catalog connector gone upstream as removed, but never Google Drive", () => {
    const upstream = upstreamMatchingCatalog().filter(
      (connector) =>
        connector.name !== "Everlaw" && connector.name !== "Google Drive",
    );
    const drift = diffConnectorCatalog(upstream);
    expect(drift.removed).toEqual([
      {
        name: "Everlaw",
        endpoint: "https://api.everlaw.com/v1/mcp",
        verified: false,
      },
    ]);
    // Drive is in the registry on Google's authority, not C4L's: its absence
    // upstream is not a removal of OUR entry.
    expect(drift.removed.map((entry) => entry.name)).not.toContain(
      "Google Drive",
    );
  });

  it("reports an endpoint change prominently, with from and to", () => {
    const upstream = upstreamMatchingCatalog().map((connector) =>
      connector.name === "Ironclad"
        ? { ...connector, url: "https://mcp.eu1.ironcladapp.com/mcp" }
        : connector,
    );
    const drift = diffConnectorCatalog(upstream);
    expect(drift.changed).toEqual([
      {
        name: "Ironclad",
        verified: false,
        endpointChanged: {
          from: "https://mcp.na1.ironcladapp.com/mcp",
          to: "https://mcp.eu1.ironcladapp.com/mcp",
        },
      },
    ]);
  });

  it("flags a change on a verified connector so re-verification is warranted", () => {
    const upstream = upstreamMatchingCatalog().map((connector) =>
      connector.name === "Google Drive"
        ? { ...connector, url: "https://drivemcp.googleapis.com/mcp/v2" }
        : connector,
    );
    const drift = diffConnectorCatalog(upstream);
    expect(drift.changed).toHaveLength(1);
    expect(drift.changed[0].name).toBe("Google Drive");
    expect(drift.changed[0].verified).toBe(true);
  });

  it("folds a same-endpoint rename into changed rather than removed plus added", () => {
    const upstream = upstreamMatchingCatalog().map((connector) =>
      connector.name === "Trellis"
        ? { ...connector, name: "Trellis Law" }
        : connector,
    );
    const drift = diffConnectorCatalog(upstream);
    expect(drift.added).toEqual([]);
    expect(drift.removed).toEqual([]);
    expect(drift.changed).toEqual([
      { name: "Trellis", renamedTo: "Trellis Law", verified: false },
    ]);
  });

  it("reports an upstream auth-shape change (explicit OAuth client appears)", () => {
    const upstream = upstreamMatchingCatalog().map((connector) =>
      connector.name === "DocuSign"
        ? { ...connector, hasExplicitOAuthClient: true }
        : connector,
    );
    const drift = diffConnectorCatalog(upstream);
    expect(drift.changed).toHaveLength(1);
    expect(drift.changed[0].name).toBe("DocuSign");
    expect(drift.changed[0].authChanged).toBeTruthy();
    expect(drift.changed[0].endpointChanged).toBeUndefined();
  });

  it("matches names case-insensitively (a casing tweak is not drift)", () => {
    const upstream = upstreamMatchingCatalog().map((connector) =>
      connector.name === "Asana"
        ? { ...connector, name: "ASANA" }
        : connector,
    );
    const drift = diffConnectorCatalog(upstream);
    expect(hasConnectorDrift(drift)).toBe(false);
  });
});

describe("diffConnectorEntries", () => {
  it("treats a custom exclusion list as upstream-only by decision", () => {
    const drift = diffConnectorEntries(
      [
        {
          name: "Internal Tool",
          url: "https://mcp.example.com",
          plugins: ["p"],
          hasExplicitOAuthClient: false,
        },
      ],
      [],
      [{ name: "Internal Tool", reason: "test" }],
    );
    expect(drift.added).toEqual([]);
    expect(drift.excluded).toEqual(["Internal Tool"]);
  });
});
