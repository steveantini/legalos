import { describe, expect, it } from "vitest";

import {
  C4L_CONNECTOR_SOURCE,
  C4L_CONNECTORS,
  CONNECTOR_CATEGORIES,
  practiceAreasSummary,
} from "@/lib/connections/providers/c4l-connector-catalog";

/**
 * The harvest-translation invariants: the catalog rows translated from the
 * upstream `.mcp.json` configs must stay internally consistent (unique ids and
 * tool prefixes, real https endpoints, valid categories, honest provenance)
 * and must respect the dedupe decisions (no second Google Drive; CoCounsel
 * deferred). Copy rules (no em dashes in user-facing strings) are asserted
 * here too, since these strings render on customer surfaces.
 */
describe("C4L connector catalog", () => {
  it("holds the 18 distinct connectors harvested across the 13 upstream configs", () => {
    // 20 distinct servers appear upstream; Google Drive is deduped against the
    // existing google-drive-mcp registry entry and CoCounsel stays deferred
    // (D-051), leaving 18.
    expect(C4L_CONNECTORS).toHaveLength(18);
  });

  it("has unique server ids, all under the registry's '-mcp' id convention", () => {
    const ids = C4L_CONNECTORS.map((c) => c.serverId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+-mcp$/);
  });

  it("has unique tool prefixes in the tool-name charset, disjoint from the Google prefixes", () => {
    const prefixes = C4L_CONNECTORS.map((c) => c.toolPrefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const prefix of prefixes) {
      expect(prefix).toMatch(/^[a-z0-9_]+$/);
      expect(["gdrive", "gmail", "gcal"]).not.toContain(prefix);
    }
  });

  it("records only https endpoints", () => {
    for (const connector of C4L_CONNECTORS) {
      expect(connector.endpoint.startsWith("https://")).toBe(true);
    }
  });

  it("does not duplicate Google Drive (deduped against google-drive-mcp) and defers CoCounsel", () => {
    for (const connector of C4L_CONNECTORS) {
      expect(connector.endpoint).not.toContain("drivemcp.googleapis.com");
      expect(connector.endpoint).not.toContain("thomsonreuters.com");
      expect(connector.serverId.startsWith("google-")).toBe(false);
    }
  });

  it("assigns every connector a known category", () => {
    for (const connector of C4L_CONNECTORS) {
      expect(Object.keys(CONNECTOR_CATEGORIES)).toContain(connector.category);
    }
  });

  it("carries provenance: at least one shipping plugin per connector", () => {
    for (const connector of C4L_CONNECTORS) {
      expect(connector.plugins.length).toBeGreaterThan(0);
    }
  });

  it("keeps user-facing copy in register: non-empty, no em or en dashes", () => {
    const strings = C4L_CONNECTORS.flatMap((c) => [c.description, c.accessNote]);
    for (const value of Object.values(CONNECTOR_CATEGORIES)) {
      strings.push(value.label, value.descriptor);
    }
    for (const s of strings) {
      expect(s.length).toBeGreaterThan(0);
      expect(s).not.toMatch(/[–—]/);
    }
  });

  it("uses honest statuses only (available until a connector is proven live)", () => {
    for (const connector of C4L_CONNECTORS) {
      expect(["available", "verified"]).toContain(connector.status);
    }
    // CourtListener flips to "verified" only when the operator's live
    // connect + agent-read test passes (see the documented operator steps).
    const courtListener = C4L_CONNECTORS.find(
      (c) => c.serverId === "courtlistener-mcp",
    );
    expect(courtListener).toBeDefined();
  });

  it("pins the upstream source to a full commit SHA", () => {
    expect(C4L_CONNECTOR_SOURCE.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(C4L_CONNECTOR_SOURCE.repo).toBe(
      "https://github.com/anthropics/claude-for-legal",
    );
  });
});

describe("practiceAreasSummary", () => {
  it("summarizes the suite-wide connectors as all practice areas", () => {
    const slack = C4L_CONNECTORS.find((c) => c.serverId === "slack-mcp");
    expect(slack).toBeDefined();
    expect(practiceAreasSummary(slack!.plugins)).toBe("All practice areas");
  });

  it("joins friendly labels for a subset", () => {
    expect(
      practiceAreasSummary(["commercial-legal", "corporate-legal"]),
    ).toBe("Commercial, Corporate");
    expect(practiceAreasSummary(["legal-clinic"])).toBe("Legal clinic");
  });
});
