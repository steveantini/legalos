import { describe, expect, it } from "vitest";

import { isNativeAction } from "./native-actions-shared";
import { validateWorkflowDefinition } from "./validate";
import {
  RENEWAL_WATCHER_TEMPLATE,
  STARTER_WORKFLOW_TEMPLATES,
  classifyStarterTemplateTool,
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

  it("every spec resolves and passes the real definition validator with the seed's classify", async () => {
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
          // The exact classify the template seed validates with (D-224): the
          // watcher's native scan step classifies read; nothing is weakened
          // for MCP tools (see the classifyStarterTemplateTool suite below).
          classifyTool: classifyStarterTemplateTool,
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

  it("includes the renewal watcher (admitted to the gallery in Stage 3a, D-224)", () => {
    expect(
      STARTER_WORKFLOW_TEMPLATES.some((t) => t.slug === RENEWAL_WATCHER_TEMPLATE.slug),
    ).toBe(true);
  });
});

describe("classifyStarterTemplateTool (the seed's validation classify, D-224)", () => {
  it("classifies the watcher's native action as read", async () => {
    const step = RENEWAL_WATCHER_TEMPLATE.steps[0];
    if (step.type !== "tool_action") throw new Error("expected the scan step");
    await expect(
      classifyStarterTemplateTool(step.serverId, step.toolName),
    ).resolves.toBe("read");
  });

  it("does not weaken validation for non-native tools (unknown stays null)", async () => {
    await expect(
      classifyStarterTemplateTool("gmail", "send_email"),
    ).resolves.toBeNull();
    await expect(
      classifyStarterTemplateTool("native:legalos", "not_a_real_action"),
    ).resolves.toBeNull();
  });

  it("a spec referencing an MCP tool still fails the seed's validation gate", async () => {
    const validation = await validateWorkflowDefinition(
      {
        steps: [
          {
            id: "send",
            type: "tool_action",
            name: "Send an email",
            serverId: "gmail",
            toolName: "send_email",
          },
        ],
      },
      {
        isAgentRunnable: async () => false,
        classifyTool: classifyStarterTemplateTool,
      },
    );
    expect(validation.ok).toBe(false);
  });
});

describe("RENEWAL_WATCHER_TEMPLATE (D-221)", () => {
  it("resolves with no agents and passes the real validator (its native tool classifies read)", async () => {
    const resolved = resolveTemplateSteps(RENEWAL_WATCHER_TEMPLATE, new Map());
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const validation = await validateWorkflowDefinition(
      { steps: resolved.steps },
      {
        isAgentRunnable: async () => false,
        classifyTool: async (serverId, toolName) =>
          isNativeAction(serverId, toolName) ? "read" : null,
      },
    );
    expect(validation).toEqual({ ok: true });
    // A single native tool_action step (the deterministic scan-and-record effect).
    expect(resolved.steps).toHaveLength(1);
    expect(resolved.steps[0].type).toBe("tool_action");
  });
});
