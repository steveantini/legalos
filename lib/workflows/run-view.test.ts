import { describe, expect, it } from "vitest";

import {
  deriveTimeline,
  formatDuration,
  pendingWriteArgKeys,
  pendingWriteToolLabel,
  renderRunValue,
  runStatusTone,
  statusPulses,
  stepProvenanceLabel,
  stepStatusTone,
  stepTypeLabel,
  type StepRunRow,
} from "./run-view";
import type { WorkflowStep } from "./types";

const AGENT_NAMES = new Map([["agent-1", "Contract reviewer"]]);

const STEPS: WorkflowStep[] = [
  { id: "s1", type: "agent", name: "Summarize", agentId: "agent-1" },
  { id: "s2", type: "human_checkpoint", name: "Review summary", prompt: "Look it over." },
  {
    id: "s3",
    type: "tool_action",
    name: "File it",
    serverId: "google-drive-mcp",
    toolName: "create_file",
  },
];

function row(overrides: Partial<StepRunRow> & Pick<StepRunRow, "step_id">): StepRunRow {
  return {
    step_type: "agent",
    status: "completed",
    input: "in",
    output: "out",
    error: null,
    approval_mode: null,
    sequence: 0,
    started_at: "2026-06-06T10:00:00.000Z",
    finished_at: "2026-06-06T10:00:02.000Z",
    ...overrides,
  };
}

describe("stepTypeLabel", () => {
  it("names an agent step by its agent, falling back when unreadable", () => {
    expect(stepTypeLabel(STEPS[0], AGENT_NAMES)).toBe("Agent: Contract reviewer");
    expect(stepTypeLabel(STEPS[0], new Map())).toBe("Agent");
  });

  it("uses the chat-consistent tool label for a tool action", () => {
    expect(stepTypeLabel(STEPS[2], AGENT_NAMES)).toBe("Google Drive: create file");
  });

  it("labels a checkpoint plainly", () => {
    expect(stepTypeLabel(STEPS[1], AGENT_NAMES)).toBe("Human checkpoint");
  });
});

describe("deriveTimeline", () => {
  it("merges snapshot order with executed rows and marks unreached steps pending while the run is alive", () => {
    const rows = [row({ step_id: "s1", sequence: 0 })];
    const timeline = deriveTimeline(STEPS, rows, "awaiting_approval", AGENT_NAMES);

    expect(timeline.map((t) => t.stepId)).toEqual(["s1", "s2", "s3"]);
    expect(timeline[0].status).toBe("completed");
    expect(timeline[0].output).toBe("out");
    expect(timeline[1].status).toBe("pending");
    expect(timeline[2].status).toBe("pending");
    expect(timeline[2].typeLabel).toBe("Google Drive: create file");
  });

  it("marks unreached steps as not run once the run has ended", () => {
    const rows = [
      row({ step_id: "s1", sequence: 0 }),
      row({
        step_id: "s2",
        step_type: "human_checkpoint",
        status: "failed",
        input: null,
        output: null,
        error: "Declined by approver.",
        sequence: 1,
      }),
    ];
    const timeline = deriveTimeline(STEPS, rows, "cancelled", AGENT_NAMES);

    expect(timeline[1].status).toBe("failed");
    expect(timeline[1].error).toBe("Declined by approver.");
    expect(timeline[2].status).toBe("not_run");
  });

  it("carries approval provenance from the row", () => {
    const rows = [
      row({
        step_id: "s2",
        step_type: "human_checkpoint",
        approval_mode: "auto_proceeded",
        sequence: 1,
      }),
    ];
    const timeline = deriveTimeline(STEPS, rows, "running", AGENT_NAMES);
    expect(timeline[1].approvalMode).toBe("auto_proceeded");
  });
});

describe("stepProvenanceLabel", () => {
  it("reads auto-proceeded from the step row alone", () => {
    expect(stepProvenanceLabel("auto_proceeded", null)).toBe("Proceeded automatically");
  });

  it("personalizes a human approval to the viewer, then the decider's name", () => {
    expect(
      stepProvenanceLabel("human_approved", {
        decision: "approved",
        deciderName: "Jane Smith",
        deciderIsViewer: true,
      }),
    ).toBe("Approved by you");
    expect(
      stepProvenanceLabel("human_approved", {
        decision: "approved",
        deciderName: "Jane Smith",
        deciderIsViewer: false,
      }),
    ).toBe("Approved by Jane Smith");
    expect(stepProvenanceLabel("human_approved", null)).toBe("Approved by a person");
  });

  it("reads a denial from the decision (a denied step has no approval_mode)", () => {
    expect(
      stepProvenanceLabel(null, {
        decision: "denied",
        deciderName: null,
        deciderIsViewer: true,
      }),
    ).toBe("Denied by you");
    expect(
      stepProvenanceLabel(null, {
        decision: "denied",
        deciderName: "Jane Smith",
        deciderIsViewer: false,
      }),
    ).toBe("Denied by Jane Smith");
  });

  it("is null when no approval was involved (read steps)", () => {
    expect(stepProvenanceLabel(null, null)).toBeNull();
  });
});

describe("formatDuration", () => {
  it("formats sub-second, seconds, and minutes", () => {
    expect(formatDuration("2026-06-06T10:00:00.000Z", "2026-06-06T10:00:00.400Z")).toBe(
      "under 1s",
    );
    expect(formatDuration("2026-06-06T10:00:00.000Z", "2026-06-06T10:00:12.000Z")).toBe("12s");
    expect(formatDuration("2026-06-06T10:00:00.000Z", "2026-06-06T10:02:05.000Z")).toBe(
      "2m 5s",
    );
    expect(formatDuration("2026-06-06T10:00:00.000Z", "2026-06-06T10:03:00.000Z")).toBe("3m");
  });

  it("is null while a step is still open or on bad input", () => {
    expect(formatDuration("2026-06-06T10:00:00.000Z", null)).toBeNull();
    expect(formatDuration(null, "2026-06-06T10:00:00.000Z")).toBeNull();
    expect(formatDuration("2026-06-06T10:00:01.000Z", "2026-06-06T10:00:00.000Z")).toBeNull();
  });
});

describe("renderRunValue", () => {
  it("renders strings as prose and structures as pretty JSON", () => {
    expect(renderRunValue("Summary text")).toEqual({ text: "Summary text", format: "text" });
    expect(renderRunValue({ name: "brief.md" })).toEqual({
      text: '{\n  "name": "brief.md"\n}',
      format: "json",
    });
  });

  it("treats null, undefined, and blank strings as nothing to show", () => {
    expect(renderRunValue(null)).toBeNull();
    expect(renderRunValue(undefined)).toBeNull();
    expect(renderRunValue("   ")).toBeNull();
  });
});

describe("pending write display (PII-safe)", () => {
  it("summarizes a write by sorted argument key names only", () => {
    expect(pendingWriteArgKeys({ name: "secret.md", content: "PRIVILEGED" })).toEqual([
      "content",
      "name",
    ]);
    expect(pendingWriteArgKeys(null)).toEqual([]);
    expect(pendingWriteArgKeys(["not", "a", "record"])).toEqual([]);
  });

  it("labels the pending tool with the chat-consistent friendly name", () => {
    const label = pendingWriteToolLabel("google-drive-mcp", "create_file");
    expect(label.full).toBe("Google Drive: create file");
    expect(label.server).toBe("Google Drive");
    expect(label.action).toBe("create file");
  });
});

describe("status tones", () => {
  it("maps run statuses to their visual register", () => {
    expect(runStatusTone("completed")).toBe("positive");
    expect(runStatusTone("awaiting_approval")).toBe("attention");
    expect(runStatusTone("failed")).toBe("negative");
    expect(runStatusTone("cancelled")).toBe("neutral");
  });

  it("maps step statuses, with unreached steps quiet", () => {
    expect(stepStatusTone("completed")).toBe("positive");
    expect(stepStatusTone("awaiting_approval")).toBe("attention");
    expect(stepStatusTone("failed")).toBe("negative");
    expect(stepStatusTone("not_run")).toBe("neutral");
    expect(stepStatusTone("pending")).toBe("neutral");
  });

  it("pulses only the in-motion statuses", () => {
    expect(statusPulses("running")).toBe(true);
    expect(statusPulses("awaiting_approval")).toBe(true);
    expect(statusPulses("completed")).toBe(false);
    expect(statusPulses("not_run")).toBe(false);
  });
});
