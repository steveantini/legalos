import { describe, expect, it } from "vitest";

import type { OrgMcpExecutionTarget } from "@/lib/connections/mcp/connection-state";
import {
  mapMcpToolsToAnthropic,
  normalizeInputSchema,
  serverPrefix,
} from "@/lib/connections/mcp/tool-mapping";
import type { McpToolDescriptor } from "@/lib/connections/providers/types";

const NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;

function target(
  serverId: string,
  tools: McpToolDescriptor[] | null,
): OrgMcpExecutionTarget {
  return {
    serverId,
    connectionId: `conn-${serverId}`,
    tokenRef: `tok-${serverId}`,
    serverUrl: `https://${serverId}.example/mcp`,
    trustTier: "first_party",
    tools,
  };
}

describe("serverPrefix", () => {
  it("maps the known Google servers to clean fixed prefixes", () => {
    expect(serverPrefix("google-drive-mcp")).toBe("gdrive");
    expect(serverPrefix("google-gmail-mcp")).toBe("gmail");
    expect(serverPrefix("google-calendar-mcp")).toBe("gcal");
  });

  it("derives a sanitized slug + hash for a self-hosted id, in the allowed charset", () => {
    const prefix = serverPrefix("self-hosted:https://mcp.acme.com/x");
    expect(prefix).toMatch(/^[A-Za-z0-9_-]+$/);
    // slug from the host plus an underscore-separated stable hash suffix.
    expect(prefix).toMatch(/_[0-9a-z]{6}$/);
  });

  it("gives distinct self-hosted ids distinct prefixes (collision-resistant)", () => {
    const a = serverPrefix("self-hosted:https://mcp.acme.com");
    const b = serverPrefix("self-hosted:https://mcp.beta.com");
    expect(a).not.toBe(b);
  });

  it("is deterministic", () => {
    expect(serverPrefix("self-hosted:https://mcp.acme.com")).toBe(
      serverPrefix("self-hosted:https://mcp.acme.com"),
    );
  });
});

describe("namespaced tool names (via mapMcpToolsToAnthropic)", () => {
  it("builds <prefix>__<tool> for a normal name", () => {
    const { toolDefs } = mapMcpToolsToAnthropic([
      target("google-drive-mcp", [{ name: "search_files", inputSchema: {} }]),
    ]);
    expect(toolDefs[0].name).toBe("gdrive__search_files");
    expect(toolDefs[0].name).toMatch(NAME_RE);
  });

  it("sanitizes a name with spaces and dots to the allowed charset", () => {
    const { toolDefs } = mapMcpToolsToAnthropic([
      target("google-gmail-mcp", [{ name: "weird tool.name!", inputSchema: {} }]),
    ]);
    expect(toolDefs[0].name).toMatch(NAME_RE);
    expect(toolDefs[0].name.startsWith("gmail__")).toBe(true);
  });

  it("truncates an over-long name to <= 64 chars and keeps distinct names distinct", () => {
    const head = "a".repeat(80);
    const { toolDefs } = mapMcpToolsToAnthropic([
      target("google-drive-mcp", [
        { name: `${head}_one`, inputSchema: {} },
        { name: `${head}_two`, inputSchema: {} },
      ]),
    ]);
    const [one, two] = toolDefs;
    expect(one.name.length).toBeLessThanOrEqual(64);
    expect(two.name.length).toBeLessThanOrEqual(64);
    expect(one.name).toMatch(NAME_RE);
    expect(two.name).toMatch(NAME_RE);
    // Two long names sharing a truncated head must NOT collide.
    expect(one.name).not.toBe(two.name);
  });
});

describe("normalizeInputSchema", () => {
  it("passes a well-formed object schema through (type forced, properties + required kept)", () => {
    const out = normalizeInputSchema({
      type: "object",
      properties: { q: { type: "string" } },
      required: ["q"],
    });
    expect(out.type).toBe("object");
    expect(out.properties).toEqual({ q: { type: "string" } });
    expect(out.required).toEqual(["q"]);
  });

  it("degrades missing/null/non-object/malformed schemas to an empty object schema", () => {
    const empty = { type: "object", properties: {} };
    expect(normalizeInputSchema(undefined)).toEqual(empty);
    expect(normalizeInputSchema(null)).toEqual(empty);
    expect(normalizeInputSchema(42)).toEqual(empty);
    expect(normalizeInputSchema("nope")).toEqual(empty);
    expect(normalizeInputSchema({})).toEqual(empty);
    expect(normalizeInputSchema({ properties: null })).toEqual(empty);
  });

  it("drops a non-string-array `required` and never throws", () => {
    const out = normalizeInputSchema({ properties: { a: {} }, required: "q" });
    expect(out.type).toBe("object");
    expect("required" in out).toBe(false);
  });
});

describe("mapMcpToolsToAnthropic", () => {
  it("maps N tools to N defs + N routing entries pointing at the right connection", () => {
    const { toolDefs, routingMap, skippedServerIds } = mapMcpToolsToAnthropic([
      target("google-drive-mcp", [
        { name: "search_files", inputSchema: {} },
        { name: "read_file", inputSchema: {} },
      ]),
    ]);
    expect(toolDefs).toHaveLength(2);
    expect(Object.keys(routingMap)).toHaveLength(2);
    expect(skippedServerIds).toEqual([]);

    const route = routingMap["gdrive__search_files"];
    expect(route).toEqual({
      serverId: "google-drive-mcp",
      connectionId: "conn-google-drive-mcp",
      tokenRef: "tok-google-drive-mcp",
      serverUrl: "https://google-drive-mcp.example/mcp",
      originalToolName: "search_files",
    });
  });

  it("contributes nothing for a null-catalog target and reports it as skipped", () => {
    const { toolDefs, routingMap, skippedServerIds } = mapMcpToolsToAnthropic([
      target("google-gmail-mcp", null),
    ]);
    expect(toolDefs).toEqual([]);
    expect(routingMap).toEqual({});
    expect(skippedServerIds).toEqual(["google-gmail-mcp"]);
  });

  it("is pure: identical input yields identical output", () => {
    const input = [
      target("google-drive-mcp", [{ name: "search_files", inputSchema: {} }]),
      target("google-calendar-mcp", [{ name: "list_events", inputSchema: {} }]),
    ];
    expect(mapMcpToolsToAnthropic(input)).toEqual(mapMcpToolsToAnthropic(input));
  });
});
