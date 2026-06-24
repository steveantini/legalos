import { describe, expect, it } from "vitest";

import {
  LEGALOS_AGENT_MODEL,
  LEGALOS_SYSTEM_AGENTS,
  legalosSystemSlug,
  legalosSystemSourceOrigin,
  planLegalosSeed,
  type ExistingLegalosAgent,
} from "./legalos-seed";

const ORG = "org-1";
const DEPT = "dept-general-tools";

const existing = (
  over: Partial<ExistingLegalosAgent> & { skill: string },
): ExistingLegalosAgent => {
  const agent = LEGALOS_SYSTEM_AGENTS.find((a) => a.skill === over.skill)!;
  return {
    id: `id-${over.skill}`,
    slug: legalosSystemSlug(over.skill),
    isFiltered: false,
    name: agent.name,
    description: agent.description,
    systemPrompt: agent.systemPrompt,
    model: LEGALOS_AGENT_MODEL,
    ...over,
  };
};

const plan = (rows: ExistingLegalosAgent[]) =>
  planLegalosSeed({
    agents: LEGALOS_SYSTEM_AGENTS,
    organizationId: ORG,
    departmentId: DEPT,
    existingBySlug: new Map(rows.map((r) => [r.slug, r])),
  });

describe("identity helpers", () => {
  it("derives the slash-form source_origin and the slug", () => {
    expect(legalosSystemSourceOrigin("summarizer")).toBe("legalos:system/summarizer");
    expect(legalosSystemSlug("summarizer")).toBe("legalos-system-summarizer");
  });
});

describe("planLegalosSeed", () => {
  it("inserts all five on a fresh org", () => {
    const p = plan([]);
    expect(p.inserts).toHaveLength(5);
    expect(p.updates).toHaveLength(0);
    expect(p.inserts.map((i) => i.slug)).toEqual([
      "legalos-system-summarizer",
      "legalos-system-term-extractor",
      "legalos-system-obligations",
      "legalos-system-plain-language",
      "legalos-system-pii-flagger",
    ]);
    expect(p.inserts.every((i) => i.departmentId === DEPT)).toBe(true);
    expect(p.inserts.every((i) => i.webSearch === false)).toBe(true);
  });

  it("is idempotent: a re-seed of unchanged rows does nothing", () => {
    const rows = LEGALOS_SYSTEM_AGENTS.map((a) => existing({ skill: a.skill }));
    const p = plan(rows);
    expect(p.inserts).toHaveLength(0);
    expect(p.updates).toHaveLength(0);
    expect(p.unchangedCount).toBe(5);
  });

  it("UPDATES in place when a canonical field has drifted", () => {
    const rows = LEGALOS_SYSTEM_AGENTS.map((a) => existing({ skill: a.skill }));
    // Simulate an old prompt + a stale name on the summarizer row.
    rows[0] = existing({
      skill: "summarizer",
      systemPrompt: "OLD PROMPT",
      name: "Old Name",
    });
    const p = plan(rows);
    expect(p.inserts).toHaveLength(0);
    expect(p.updates).toHaveLength(1);
    expect(p.updates[0].slug).toBe("legalos-system-summarizer");
    // Updated back to canonical (the current spec text + model).
    expect(p.updates[0].systemPrompt).toBe(
      LEGALOS_SYSTEM_AGENTS[0].systemPrompt,
    );
    expect(p.updates[0].name).toBe("Document Summarizer");
    expect(p.updates[0].model).toBe(LEGALOS_AGENT_MODEL);
    expect(p.unchangedCount).toBe(4);
  });

  it("never resurrects a soft-deleted (filtered) row", () => {
    const rows = LEGALOS_SYSTEM_AGENTS.map((a) =>
      existing({ skill: a.skill, isFiltered: a.skill === "pii-flagger" }),
    );
    const p = plan(rows);
    expect(p.skippedFiltered).toEqual(["legalos-system-pii-flagger"]);
    // The filtered one is neither inserted nor updated.
    expect(p.inserts).toHaveLength(0);
    expect(p.updates).toHaveLength(0);
    expect(p.unchangedCount).toBe(4);
  });

  it("ignores Claude for Legal rows and user forks entirely (different slugs)", () => {
    // The store hands the planner only legalos:% rows, but prove the planner
    // would not act on a stray C4L row or a forked copy even if present: it keys
    // strictly on the legalos-system-<skill> slug, so these are not matched and
    // not touched (they appear in neither inserts, updates, nor skipped).
    const foreign: ExistingLegalosAgent[] = [
      {
        id: "c4l-1",
        slug: "c4l-commercial-legal-nda",
        isFiltered: false,
        name: "NDA Review",
        description: null,
        systemPrompt: "c4l prompt",
        model: LEGALOS_AGENT_MODEL,
      },
      {
        id: "fork-1",
        slug: "document-summarizer-my-copy-a1b2",
        isFiltered: false,
        name: "Document Summarizer (My Copy)",
        description: null,
        systemPrompt: "forked prompt",
        model: LEGALOS_AGENT_MODEL,
      },
    ];
    const p = plan(foreign);
    // All five system agents are missing by slug, so all five insert; the two
    // foreign rows are referenced nowhere.
    expect(p.inserts).toHaveLength(5);
    expect(p.updates).toHaveLength(0);
    expect(p.skippedFiltered).toHaveLength(0);
    const touched = [
      ...p.inserts.map((i) => i.slug),
      ...p.updates.map((u) => u.slug),
      ...p.skippedFiltered,
    ];
    expect(touched).not.toContain("c4l-commercial-legal-nda");
    expect(touched).not.toContain("document-summarizer-my-copy-a1b2");
  });
});
