import { describe, expect, it } from "vitest";

import {
  c4lSlug,
  planC4LImport,
  type ExistingC4LAgent,
  type ParsedC4LSkill,
} from "./c4l-import";
import type { VendorContentProvider } from "./vendor-registry";

// A small test provider: two mapped plugins, one (the third in skills) unmapped.
const PROVIDER: VendorContentProvider = {
  providerId: "claude-for-legal",
  displayLabel: "Claude for Legal",
  sourceRepo: "https://github.com/anthropics/claude-for-legal",
  pluginDepartmentMap: {
    "commercial-legal": "commercial",
    "privacy-legal": "privacy",
  },
};

const DEPT_IDS: Record<string, string> = {
  commercial: "dept-commercial-id",
  privacy: "dept-privacy-id",
};

function skill(overrides: Partial<ParsedC4LSkill> = {}): ParsedC4LSkill {
  return {
    plugin: "commercial-legal",
    skill: "nda-review",
    name: "NDA review",
    description: "Reviews NDAs.",
    systemPrompt: "You review NDAs.",
    ...overrides,
  };
}

function existing(overrides: Partial<ExistingC4LAgent> = {}): ExistingC4LAgent {
  return {
    id: "agent-1",
    slug: c4lSlug("commercial-legal", "nda-review"),
    departmentId: "dept-commercial-id",
    isFiltered: false,
    name: "NDA review",
    description: "Reviews NDAs.",
    systemPrompt: "You review NDAs.",
    ...overrides,
  };
}

function plan(
  skills: ParsedC4LSkill[],
  existingRows: ExistingC4LAgent[] = [],
) {
  return planC4LImport({
    skills,
    provider: PROVIDER,
    organizationId: "org-1",
    departmentIdBySlug: DEPT_IDS,
    existingBySlug: new Map(existingRows.map((r) => [r.slug, r])),
  });
}

describe("planC4LImport — safety rules", () => {
  it("(i) NEVER reactivates a soft-deleted/filtered row", () => {
    const result = plan([skill()], [existing({ isFiltered: true })]);
    expect(result.skippedFiltered).toEqual([
      c4lSlug("commercial-legal", "nda-review"),
    ]);
    // Not inserted, not reported as an update — fully left alone.
    expect(result.inserts).toHaveLength(0);
    expect(result.updatesAvailable).toHaveLength(0);
  });

  it("(ii) places a NEW skill via the mapping, not a passed argument", () => {
    const result = plan([skill({ plugin: "privacy-legal", skill: "dsar" })]);
    expect(result.inserts).toHaveLength(1);
    const row = result.inserts[0];
    expect(row.departmentId).toBe(DEPT_IDS.privacy);
    expect(row.slug).toBe(c4lSlug("privacy-legal", "dsar"));
    expect(row.sourceOrigin).toBe("claude-for-legal:privacy-legal/dsar");
  });

  it("(iii) reports an UNMAPPED plugin and imports it nowhere", () => {
    const result = plan([
      skill({ plugin: "tax-legal", skill: "audit-helper" }),
    ]);
    expect(result.unmappedPlugins).toEqual(["tax-legal"]);
    expect(result.inserts).toHaveLength(0);
  });

  it("(iv) NEVER modifies an existing active row; reports content drift only", () => {
    const result = plan(
      [skill({ systemPrompt: "You review NDAs MUCH better now." })],
      [existing()],
    );
    expect(result.inserts).toHaveLength(0);
    expect(result.skippedFiltered).toHaveLength(0);
    expect(result.updatesAvailable).toEqual([
      {
        slug: c4lSlug("commercial-legal", "nda-review"),
        agentId: "agent-1",
        changedFields: ["system_prompt"],
      },
    ]);
  });

  it("(iv) an existing active row identical to upstream is a no-op", () => {
    const result = plan([skill()], [existing()]);
    expect(result.inserts).toHaveLength(0);
    expect(result.updatesAvailable).toHaveLength(0);
    expect(result.unchangedCount).toBe(1);
  });

  it("(d) is idempotent: re-importing the same mapped skills inserts nothing", () => {
    const skills = [
      skill(),
      skill({ plugin: "privacy-legal", skill: "dsar", name: "DSAR" }),
    ];
    const existingRows = [
      existing(),
      existing({
        id: "agent-2",
        slug: c4lSlug("privacy-legal", "dsar"),
        departmentId: "dept-privacy-id",
        name: "DSAR",
        description: "Reviews NDAs.",
      }),
    ];
    const result = plan(skills, existingRows);
    expect(result.inserts).toHaveLength(0);
    expect(result.unchangedCount).toBe(2);
  });

  it("respects admin placement: an existing active row is never moved, even if the map differs", () => {
    // The map says commercial; the row was moved to another department by an admin.
    const moved = existing({ departmentId: "dept-somewhere-else" });
    const result = plan([skill()], [moved]);
    // No insert, no modification — placement is preserved (the row is untouched).
    expect(result.inserts).toHaveLength(0);
    expect(result.unchangedCount).toBe(1);
  });
});
