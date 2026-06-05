import { describe, expect, it } from "vitest";

import { validateWorkflowDefinition, type ValidationDeps } from "./validate";

/** Fakes: only "good-agent" is runnable; "read_tool" is read, "write_tool" is write, else unknown. */
const deps: ValidationDeps = {
  isAgentRunnable: async (agentId) => agentId === "good-agent",
  classifyTool: async (_serverId, toolName) =>
    toolName === "read_tool" ? "read" : toolName === "write_tool" ? "write" : null,
};

describe("validateWorkflowDefinition", () => {
  it("accepts a valid linear definition (agent + read tool_action)", async () => {
    const result = await validateWorkflowDefinition(
      {
        steps: [
          { id: "a1", type: "agent", name: "Draft", agentId: "good-agent" },
          {
            id: "t1",
            type: "tool_action",
            name: "Search",
            serverId: "gdrive",
            toolName: "read_tool",
            argMapping: { q: { source: "previous" } },
          },
          {
            id: "a2",
            type: "agent",
            name: "Summarize",
            agentId: "good-agent",
            inputMapping: { source: "step", stepId: "a1" },
          },
        ],
      },
      deps,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects an empty or malformed definition", async () => {
    expect((await validateWorkflowDefinition({ steps: [] }, deps)).ok).toBe(false);
    expect((await validateWorkflowDefinition({}, deps)).ok).toBe(false);
    expect((await validateWorkflowDefinition(null, deps)).ok).toBe(false);
  });

  it("rejects an unknown step type", async () => {
    const result = await validateWorkflowDefinition(
      { steps: [{ id: "x", type: "frobnicate", name: "Bad" }] },
      deps,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/unknown step type/i);
  });

  it("rejects a dangling input mapping reference (not a prior step)", async () => {
    const result = await validateWorkflowDefinition(
      {
        steps: [
          {
            id: "a1",
            type: "agent",
            name: "First",
            agentId: "good-agent",
            inputMapping: { source: "step", stepId: "nope" },
          },
        ],
      },
      deps,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/not a prior step/i);
  });

  it("rejects a write tool_action (no unattended writes in v1)", async () => {
    const result = await validateWorkflowDefinition(
      {
        steps: [
          { id: "t1", type: "tool_action", name: "Send", serverId: "gmail", toolName: "write_tool" },
        ],
      },
      deps,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/write/i);
  });

  it("rejects an unresolvable agentId and an unresolvable tool", async () => {
    const badAgent = await validateWorkflowDefinition(
      { steps: [{ id: "a1", type: "agent", name: "X", agentId: "ghost" }] },
      deps,
    );
    expect(badAgent.ok).toBe(false);

    const badTool = await validateWorkflowDefinition(
      { steps: [{ id: "t1", type: "tool_action", name: "X", serverId: "s", toolName: "ghost" }] },
      deps,
    );
    expect(badTool.ok).toBe(false);
  });
});
