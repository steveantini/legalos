import { describe, expect, it } from "vitest";

import type { ToolArgSpec } from "./capabilities";
import type { WorkflowStep } from "./types";
import {
  splitToolArgs,
  stepReadback,
  workflowReadback,
  type ReadbackCapabilities,
} from "./builder-view";

const caps: ReadbackCapabilities = {
  agentNameById: new Map([["agent-1", "NDA Reviewer"]]),
  toolByKey: new Map([
    [
      "google-gmail-mcp::send_message",
      { fullLabel: "Gmail: send message", access: "write" as const },
    ],
    [
      "google-drive-mcp::search_files",
      { fullLabel: "Google Drive: search files", access: "read" as const },
    ],
  ]),
};

function agentStep(overrides: Partial<Extract<WorkflowStep, { type: "agent" }>>): WorkflowStep {
  return { id: "s1", type: "agent", name: "Step", agentId: "agent-1", ...overrides };
}

describe("stepReadback", () => {
  it("reads an instructed agent step as who does what", () => {
    expect(
      stepReadback(
        agentStep({ instruction: "Review this NDA and flag unusual terms" }),
        0,
        [],
        caps,
      ),
    ).toBe("NDA Reviewer: Review this NDA and flag unusual terms");
  });

  it("reads an uninstructed first agent step as working on the run input", () => {
    expect(stepReadback(agentStep({}), 0, [], caps)).toBe(
      "NDA Reviewer works on the run input",
    );
  });

  it("reads an uninstructed later agent step as working on the previous output", () => {
    expect(stepReadback(agentStep({}), 1, [], caps)).toBe(
      "NDA Reviewer works on the previous step’s output",
    );
  });

  it("names a referenced earlier step by its position", () => {
    const steps: WorkflowStep[] = [
      agentStep({ id: "first" }),
      agentStep({ id: "second", inputMapping: { source: "step", stepId: "first" } }),
    ];
    expect(stepReadback(steps[1], 1, steps, caps)).toBe(
      "NDA Reviewer works on the output of step 1",
    );
  });

  it("reads honest placeholders for unfinished steps", () => {
    expect(stepReadback(agentStep({ agentId: "" }), 0, [], caps)).toBe(
      "An agent you haven’t chosen yet works on the run input",
    );
    expect(
      stepReadback(
        { id: "t", type: "tool_action", name: "Act", serverId: "", toolName: "" },
        0,
        [],
        caps,
      ),
    ).toBe("Take an action with a tool you haven’t chosen yet");
  });

  it("reads a write tool action with its approval pause visible", () => {
    expect(
      stepReadback(
        {
          id: "t",
          type: "tool_action",
          name: "Send",
          serverId: "google-gmail-mcp",
          toolName: "send_message",
        },
        0,
        [],
        caps,
      ),
    ).toBe("Gmail: send message (pauses for your approval first)");
  });

  it("reads a read tool action as its plain label", () => {
    expect(
      stepReadback(
        {
          id: "t",
          type: "tool_action",
          name: "Search",
          serverId: "google-drive-mcp",
          toolName: "search_files",
        },
        0,
        [],
        caps,
      ),
    ).toBe("Google Drive: search files");
  });

  it("reads a checkpoint as the pause it is", () => {
    expect(
      stepReadback(
        { id: "c", type: "human_checkpoint", name: "Review", prompt: "Check it" },
        0,
        [],
        caps,
      ),
    ).toBe("Pause for your approval");
  });
});

describe("workflowReadback", () => {
  it("derives one phrase per step, in order", () => {
    const steps: WorkflowStep[] = [
      agentStep({ instruction: "Review the NDA" }),
      { id: "c", type: "human_checkpoint", name: "Review", prompt: "Check it" },
    ];
    expect(workflowReadback(steps, caps)).toEqual([
      "NDA Reviewer: Review the NDA",
      "Pause for your approval",
    ]);
  });
});

describe("splitToolArgs", () => {
  const arg = (name: string, required: boolean): ToolArgSpec => ({
    name,
    type: "string",
    required,
    description: null,
  });

  it("shows required args up front and tucks optional ones behind advanced", () => {
    const { essential, advanced } = splitToolArgs([
      arg("to", true),
      arg("htmlBody", false),
      arg("subject", true),
    ]);
    expect(essential.map((a) => a.name)).toEqual(["to", "subject"]);
    expect(advanced.map((a) => a.name)).toEqual(["htmlBody"]);
  });

  it("treats everything as essential when the tool requires nothing", () => {
    const { essential, advanced } = splitToolArgs([arg("q", false), arg("limit", false)]);
    expect(essential.map((a) => a.name)).toEqual(["q", "limit"]);
    expect(advanced).toEqual([]);
  });

  it("handles a tool with no args", () => {
    expect(splitToolArgs([])).toEqual({ essential: [], advanced: [] });
  });
});
