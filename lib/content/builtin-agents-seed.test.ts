import { describe, expect, it } from "vitest";

import {
  DOCUMENT_COMPARE_PRE_STEP,
  hasDocumentComparePreStep,
  parseAgentCapabilities,
} from "@/lib/agents/capabilities";

import {
  BUILTIN_AGENT_MODEL,
  BUILTIN_AGENTS,
  builtinSlug,
  builtinSourceOrigin,
  builtinToolsEnabled,
  planBuiltinSeed,
  type ExistingBuiltinAgent,
} from "./builtin-agents-seed";

const ORG = "org-1";
const DEPT = "dept-general-tools";

/** Sort-order base mirrored from the seed module (SORT_ORDER_BASE = 100). */
const SORT_BASE = 100;

const existing = (
  over: Partial<ExistingBuiltinAgent> & { skill: string },
): ExistingBuiltinAgent => {
  const idx = BUILTIN_AGENTS.findIndex((a) => a.skill === over.skill);
  const agent = BUILTIN_AGENTS[idx]!;
  return {
    id: `id-${over.skill}`,
    slug: builtinSlug(over.skill),
    isFiltered: false,
    name: agent.name,
    description: agent.description,
    systemPrompt: agent.systemPrompt,
    model: BUILTIN_AGENT_MODEL,
    // Canonical launchpad order = array position, so a row built from a
    // definition is "unchanged" unless a test overrides it.
    sortOrder: SORT_BASE + idx,
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
  it("inserts all six on a fresh org, Document Comparison first then reading order", () => {
    const p = plan([]);
    expect(p.inserts).toHaveLength(6);
    expect(p.updates).toHaveLength(0);
    // Order (D-190): flagship first, then understand -> pull -> transform -> check.
    expect(p.inserts.map((i) => i.slug)).toEqual([
      "builtin-document-comparison",
      "builtin-summarizer",
      "builtin-term-extractor",
      "builtin-obligations",
      "builtin-plain-language",
      "builtin-pii-flagger",
    ]);
    // sort_order is ascending in that same order and the launchpad sorts by it.
    expect(p.inserts.map((i) => i.sortOrder)).toEqual([
      100, 101, 102, 103, 104, 105,
    ]);
    expect(p.inserts.every((i) => i.departmentId === DEPT)).toBe(true);
    expect(p.inserts.every((i) => i.webSearch === false)).toBe(true);
  });

  it("re-seeds sort_order in place when the live order is stale (updates, not inserts)", () => {
    // The pre-D-190 live order: Document Comparison was seeded last (105), the
    // other five ahead of it. A re-seed must bring every row to the new order.
    const staleOrder = [
      "summarizer",
      "term-extractor",
      "obligations",
      "plain-language",
      "pii-flagger",
      "document-comparison",
    ];
    const rows = staleOrder.map((skill, i) =>
      existing({ skill, sortOrder: SORT_BASE + i }),
    );
    const p = plan(rows);
    expect(p.inserts).toHaveLength(0);
    // Every row's sort_order differs under the new order, so all six update
    // (in place) and none is reported unchanged.
    expect(p.updates).toHaveLength(6);
    expect(p.unchangedCount).toBe(0);
    const cmp = p.updates.find((u) => u.slug === "builtin-document-comparison")!;
    expect(cmp.sortOrder).toBe(100);
    const pii = p.updates.find((u) => u.slug === "builtin-pii-flagger")!;
    expect(pii.sortOrder).toBe(105);
  });

  it("seeds the Document Comparison agent with the deterministic pre-step capability", () => {
    const p = plan([]);
    const compare = p.inserts.find((i) => i.slug === "builtin-document-comparison");
    expect(compare).toBeDefined();
    expect(compare!.preSteps).toEqual([DOCUMENT_COMPARE_PRE_STEP]);
    expect(compare!.webSearch).toBe(false);
    // The tools_enabled actually written must route to a pre-step, never a model tool.
    const toolsEnabled = builtinToolsEnabled(compare!);
    expect(toolsEnabled).toEqual([DOCUMENT_COMPARE_PRE_STEP]);
    expect(hasDocumentComparePreStep(toolsEnabled)).toBe(true);
    const caps = parseAgentCapabilities(toolsEnabled);
    expect(caps.preSteps).toEqual([DOCUMENT_COMPARE_PRE_STEP]);
    expect(caps.modelTools).toEqual([]);

    // The other five carry no pre-step (and an empty tools_enabled).
    for (const insert of p.inserts.filter(
      (i) => i.slug !== "builtin-document-comparison",
    )) {
      expect(insert.preSteps).toEqual([]);
      expect(builtinToolsEnabled(insert)).toEqual([]);
      expect(hasDocumentComparePreStep(builtinToolsEnabled(insert))).toBe(false);
    }
  });

  it("is idempotent: a re-seed of unchanged rows does nothing", () => {
    const rows = BUILTIN_AGENTS.map((a) => existing({ skill: a.skill }));
    const p = plan(rows);
    expect(p.inserts).toHaveLength(0);
    expect(p.updates).toHaveLength(0);
    expect(p.unchangedCount).toBe(6);
  });

  it("UPDATES in place when a canonical field has drifted", () => {
    const rows = BUILTIN_AGENTS.map((a) => existing({ skill: a.skill }));
    // Simulate an old prompt + a stale name on the summarizer row (found by slug,
    // since array position is no longer summarizer after the D-190 reorder).
    const sumIdx = rows.findIndex((r) => r.slug === "builtin-summarizer");
    rows[sumIdx] = existing({
      skill: "summarizer",
      systemPrompt: "OLD PROMPT",
      name: "Old Name",
    });
    const p = plan(rows);
    expect(p.inserts).toHaveLength(0);
    expect(p.updates).toHaveLength(1);
    expect(p.updates[0].slug).toBe("builtin-summarizer");
    // Updated back to canonical (the current spec text + model).
    const summarizer = BUILTIN_AGENTS.find((a) => a.skill === "summarizer")!;
    expect(p.updates[0].systemPrompt).toBe(summarizer.systemPrompt);
    expect(p.updates[0].name).toBe("Document Summarizer");
    expect(p.updates[0].model).toBe(BUILTIN_AGENT_MODEL);
    expect(p.unchangedCount).toBe(5);
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
    expect(p.unchangedCount).toBe(5);
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
        sortOrder: null,
      },
      {
        id: "fork-1",
        slug: "document-summarizer-my-copy-a1b2",
        isFiltered: false,
        name: "Document Summarizer (My Copy)",
        description: null,
        systemPrompt: "forked prompt",
        model: BUILTIN_AGENT_MODEL,
        sortOrder: null,
      },
    ];
    const p = plan(foreign);
    // All six system agents are missing by slug, so all six insert; the two
    // foreign rows are referenced nowhere.
    expect(p.inserts).toHaveLength(6);
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
