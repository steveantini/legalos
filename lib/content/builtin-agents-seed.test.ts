import { describe, expect, it } from "vitest";

import {
  BUILTIN_AGENT_MODEL,
  BUILTIN_AGENTS,
  builtinSlug,
  builtinSourceOrigin,
  planBuiltinSeed,
  type ExistingBuiltinAgent,
} from "./builtin-agents-seed";

const ORG = "org-1";
const DEPT = "dept-general-tools";

const existing = (
  over: Partial<ExistingBuiltinAgent> & { skill: string },
): ExistingBuiltinAgent => {
  const agent = BUILTIN_AGENTS.find((a) => a.skill === over.skill)!;
  return {
    id: `id-${over.skill}`,
    slug: builtinSlug(over.skill),
    isFiltered: false,
    name: agent.name,
    description: agent.description,
    systemPrompt: agent.systemPrompt,
    model: BUILTIN_AGENT_MODEL,
    ...over,
  };
};

const plan = (rows: ExistingBuiltinAgent[]) =>
  planBuiltinSeed({
    agents: BUILTIN_AGENTS,
    organizationId: ORG,
    departmentId: DEPT,
    existingBySlug: new Map(rows.map((r) => [r.slug, r])),
  });

describe("identity helpers", () => {
  it("derives the slash-form source_origin and the slug", () => {
    expect(builtinSourceOrigin("summarizer")).toBe("builtin:tools/summarizer");
    expect(builtinSlug("summarizer")).toBe("builtin-summarizer");
  });
});

describe("planBuiltinSeed", () => {
  it("inserts all five on a fresh org", () => {
    const p = plan([]);
    expect(p.inserts).toHaveLength(5);
    expect(p.updates).toHaveLength(0);
    expect(p.inserts.map((i) => i.slug)).toEqual([
      "builtin-summarizer",
      "builtin-term-extractor",
      "builtin-obligations",
      "builtin-plain-language",
      "builtin-pii-flagger",
    ]);
    expect(p.inserts.every((i) => i.departmentId === DEPT)).toBe(true);
    expect(p.inserts.every((i) => i.webSearch === false)).toBe(true);
  });

  it("is idempotent: a re-seed of unchanged rows does nothing", () => {
    const rows = BUILTIN_AGENTS.map((a) => existing({ skill: a.skill }));
    const p = plan(rows);
    expect(p.inserts).toHaveLength(0);
    expect(p.updates).toHaveLength(0);
    expect(p.unchangedCount).toBe(5);
  });

  it("UPDATES in place when a canonical field has drifted", () => {
    const rows = BUILTIN_AGENTS.map((a) => existing({ skill: a.skill }));
    // Simulate an old prompt + a stale name on the summarizer row.
    rows[0] = existing({
      skill: "summarizer",
      systemPrompt: "OLD PROMPT",
      name: "Old Name",
    });
    const p = plan(rows);
    expect(p.inserts).toHaveLength(0);
    expect(p.updates).toHaveLength(1);
    expect(p.updates[0].slug).toBe("builtin-summarizer");
    // Updated back to canonical (the current spec text + model).
    expect(p.updates[0].systemPrompt).toBe(
      BUILTIN_AGENTS[0].systemPrompt,
    );
    expect(p.updates[0].name).toBe("Document Summarizer");
    expect(p.updates[0].model).toBe(BUILTIN_AGENT_MODEL);
    expect(p.unchangedCount).toBe(4);
  });

  it("never resurrects a soft-deleted (filtered) row", () => {
    const rows = BUILTIN_AGENTS.map((a) =>
      existing({ skill: a.skill, isFiltered: a.skill === "pii-flagger" }),
    );
    const p = plan(rows);
    expect(p.skippedFiltered).toEqual(["builtin-pii-flagger"]);
    // The filtered one is neither inserted nor updated.
    expect(p.inserts).toHaveLength(0);
    expect(p.updates).toHaveLength(0);
    expect(p.unchangedCount).toBe(4);
  });

  it("ignores Claude for Legal rows and user forks entirely (different slugs)", () => {
    // The store hands the planner only builtin:% rows, but prove the planner
    // would not act on a stray C4L row or a forked copy even if present: it keys
    // strictly on the builtin-<skill> slug, so these are not matched and
    // not touched (they appear in neither inserts, updates, nor skipped).
    const foreign: ExistingBuiltinAgent[] = [
      {
        id: "c4l-1",
        slug: "c4l-commercial-legal-nda",
        isFiltered: false,
        name: "NDA Review",
        description: null,
        systemPrompt: "c4l prompt",
        model: BUILTIN_AGENT_MODEL,
      },
      {
        id: "fork-1",
        slug: "document-summarizer-my-copy-a1b2",
        isFiltered: false,
        name: "Document Summarizer (My Copy)",
        description: null,
        systemPrompt: "forked prompt",
        model: BUILTIN_AGENT_MODEL,
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
