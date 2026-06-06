import { describe, expect, it } from "vitest";

import { validateWorkflowDefinition } from "./validate";
import {
  STARTER_WORKFLOW_TEMPLATES,
  resolveTemplateSteps,
} from "./templates";

/** A resolution map covering every agent slug the starter specs reference. */
function fullAgentMap(): Map<string, string> {
  const map = new Map<string, string>();
  let n = 0;
  for (const spec of STARTER_WORKFLOW_TEMPLATES) {
    for (const step of spec.steps) {
      if (step.type === "agent" && !map.has(step.agentSlug)) {
        map.set(step.agentSlug, `agent-id-${++n}`);
      }
    }
  }
  return map;
}

describe("resolveTemplateSteps", () => {
  it("resolves agent slugs to ids and passes checkpoints through", () => {
    const spec = STARTER_WORKFLOW_TEMPLATES[0]; // Review an inbound NDA
    const result = resolveTemplateSteps(
      spec,
      new Map([["c4l-commercial-legal-nda-review", "agent-123"]]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.steps).toEqual([
        {
          id: "review-nda",
          type: "agent",
          name: "Review the NDA",
          agentId: "agent-123",
          instruction:
            "Review this NDA and flag unusual or unfavorable terms, with suggested redlines.",
        },
        {
          id: "review-findings",
          type: "human_checkpoint",
          name: "Review the findings",
          prompt:
            "Review the agent’s findings and suggested redlines before relying on them.",
        },
      ]);
    }
  });

  it("reports the missing slugs (deduplicated) instead of resolving partially", () => {
    const spec = STARTER_WORKFLOW_TEMPLATES[2]; // Review and respond (two agents)
    const result = resolveTemplateSteps(
      spec,
      new Map([["enterprise-agreement-review", "agent-1"]]),
    );
    expect(result).toEqual({
      ok: false,
      missingAgentSlugs: ["c4l-commercial-legal-stakeholder-summary"],
    });
  });
});

describe("STARTER_WORKFLOW_TEMPLATES", () => {
  it("has unique template slugs", () => {
    const slugs = STARTER_WORKFLOW_TEMPLATES.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every spec resolves and passes the real definition validator", async () => {
    const agentMap = fullAgentMap();
    const agentIds = new Set(agentMap.values());
    for (const spec of STARTER_WORKFLOW_TEMPLATES) {
      const resolved = resolveTemplateSteps(spec, agentMap);
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) continue;
      const validation = await validateWorkflowDefinition(
        { steps: resolved.steps },
        {
          isAgentRunnable: async (id) => agentIds.has(id),
          classifyTool: async () => null,
        },
      );
      expect(validation).toEqual({ ok: true });
    }
  });

  it("the flagship contract template routes inside one instructed agent step (no branching)", () => {
    const flagship = STARTER_WORKFLOW_TEMPLATES.find(
      (t) => t.slug === "review-any-contract",
    );
    expect(flagship).toBeDefined();
    const agentSteps = flagship!.steps.filter((s) => s.type === "agent");
    expect(agentSteps).toHaveLength(1);
    expect(
      agentSteps[0].type === "agent" && agentSteps[0].instruction,
    ).toMatch(/identify what kind of contract/i);
  });
});
