import { describe, expect, it } from "vitest";

import {
  externalCollapseSectionKey,
  getDisplayLabelFromOrigin,
  getSourceDisplayLabel,
  getSourceLaunchpadSubline,
  groupAgentsBySource,
  launchpadGroupVisible,
  parseSourceOrigin,
} from "./source";

type Agent = { id: string; source_origin: string | null };

const a = (id: string, source_origin: string | null): Agent => ({
  id,
  source_origin,
});

describe("groupAgentsBySource", () => {
  it("groups external agents by source id, ignoring null-source agents", () => {
    const groups = groupAgentsBySource([
      a("1", "claude-for-legal:commercial-legal/nda"),
      a("2", null),
      a("3", "claude-for-legal:privacy-legal/dsar"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].sourceId).toBe("claude-for-legal");
    expect(groups[0].displayLabel).toBe("Claude for Legal");
    expect(groups[0].agents.map((x) => x.id)).toEqual(["1", "3"]);
  });

  it("is behavior-identical to a single bucket when one vendor is present", () => {
    const agents = [
      a("1", "claude-for-legal:commercial-legal/nda"),
      a("2", "claude-for-legal:ip-legal/trademark"),
    ];
    const groups = groupAgentsBySource(agents);
    expect(groups).toHaveLength(1);
    // Same agents, same order as the input (caller pre-sorts).
    expect(groups[0].agents.map((x) => x.id)).toEqual(["1", "2"]);
  });

  it("splits multiple vendors and orders by the provider order, unknown last", () => {
    const groups = groupAgentsBySource(
      [
        a("u", "acme-legal:x/y"), // unregistered → after registered, alpha
        a("c", "claude-for-legal:commercial-legal/nda"),
        a("o", "openai-legal:contracts/review"),
      ],
      // A hypothetical provider order with claude first, openai second.
      ["claude-for-legal", "openai-legal"],
    );
    expect(groups.map((g) => g.sourceId)).toEqual([
      "claude-for-legal",
      "openai-legal",
      "acme-legal",
    ]);
  });

  it("labels an unknown source id gracefully (humanized)", () => {
    const groups = groupAgentsBySource([a("1", "stanford-codex:clinic/intake")]);
    expect(groups[0].displayLabel).toBe("Stanford Codex");
  });

  it("a malformed-but-non-null source still groups by its prefix (none vanish)", () => {
    const groups = groupAgentsBySource([a("1", "weird-vendor:no-slash-here")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].sourceId).toBe("weird-vendor");
    expect(groups[0].agents.map((x) => x.id)).toEqual(["1"]);
  });
});

describe("getSourceDisplayLabel", () => {
  it("uses the registry label for a registered provider", () => {
    expect(getSourceDisplayLabel("claude-for-legal")).toBe("Claude for Legal");
  });
  it("humanizes an unregistered source id", () => {
    expect(getSourceDisplayLabel("future-vendor")).toBe("Future Vendor");
  });
  it("labels the legalOS system tier 'Powered by legalOS'", () => {
    expect(getSourceDisplayLabel("legalos")).toBe("Powered by legalOS");
    expect(getDisplayLabelFromOrigin("legalos:system/contract-summarizer")).toBe(
      "Powered by legalOS",
    );
  });
});

describe("legalOS system tier", () => {
  it("carries its own launchpad subline; vendors use theirs; unknown has none", () => {
    expect(getSourceLaunchpadSubline("legalos")).toMatch(/legalOS/);
    expect(getSourceLaunchpadSubline("claude-for-legal")).toBeTruthy();
    expect(getSourceLaunchpadSubline("future-vendor")).toBeUndefined();
  });

  it("renders as its own group, ordered FIRST, distinct from Claude for Legal", () => {
    const groups = groupAgentsBySource([
      a("c", "claude-for-legal:commercial-legal/nda"),
      a("s", "legalos:system/contract-summarizer"),
    ]);
    expect(groups.map((g) => g.sourceId)).toEqual(["legalos", "claude-for-legal"]);
    expect(groups[0].displayLabel).toBe("Powered by legalOS");
    expect(groups[0].agents.map((x) => x.id)).toEqual(["s"]);
  });

  it("is ALWAYS visible on the launchpad even when vendor settings would disable it", () => {
    const allDisabled = () => false;
    expect(launchpadGroupVisible("legalos", allDisabled)).toBe(true);
    expect(launchpadGroupVisible("claude-for-legal", allDisabled)).toBe(false);
    expect(launchpadGroupVisible("claude-for-legal", () => true)).toBe(true);
  });
});

describe("externalCollapseSectionKey", () => {
  it("keeps the legacy 'externalAgents' key for claude-for-legal (back-compat)", () => {
    expect(externalCollapseSectionKey("claude-for-legal")).toBe("externalAgents");
  });
  it("namespaces other vendors", () => {
    expect(externalCollapseSectionKey("openai-legal")).toBe("external:openai-legal");
  });
});

describe("parseSourceOrigin", () => {
  it("parses a well-formed origin", () => {
    expect(parseSourceOrigin("claude-for-legal:commercial-legal/nda")).toEqual({
      sourceId: "claude-for-legal",
      plugin: "commercial-legal",
      skill: "nda",
    });
  });
  it("now accepts an unregistered source id (returns parsed, not null)", () => {
    expect(parseSourceOrigin("openai-legal:contracts/review")).toEqual({
      sourceId: "openai-legal",
      plugin: "contracts",
      skill: "review",
    });
  });
  it("returns null for a malformed shape", () => {
    expect(parseSourceOrigin("claude-for-legal:no-slash")).toBeNull();
    expect(parseSourceOrigin(null)).toBeNull();
  });
});
