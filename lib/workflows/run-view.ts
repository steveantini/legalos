import { toolLabel, type ToolLabel } from "@/lib/chat/tool-display";
import { serverPrefix } from "@/lib/connections/mcp/tool-mapping";
import type {
  AutonomyLevel,
  StepApprovalMode,
  WorkflowRunStatus,
  WorkflowStep,
  WorkflowStepStatus,
  WorkflowStepType,
} from "@/lib/workflows/types";

/**
 * Pure view-model helpers for the workflow run experience (Workflows arc, Step
 * 4b): the run view that renders the immutable per-step audit trail, the
 * approval card, and the run-history list. Presentation derivation only — no
 * I/O, no React — so the mapping from persisted records to what a lawyer reads
 * is unit-testable.
 *
 * The one structural job here is `deriveTimeline`: the run's
 * `definition_snapshot` is the source of truth for WHICH steps the run has (so
 * the viewer sees steps that haven't executed yet), and the persisted
 * `workflow_step_runs` rows are the source of truth for what each executed step
 * actually did. Steps with no row read as "pending" while the run is alive and
 * "not run" once it has ended (failed / cancelled before reaching them).
 */

// ---- Status labels + tones ---------------------------------------------------

export const RUN_STATUS_LABEL: Record<WorkflowRunStatus, string> = {
  pending: "Pending",
  running: "Running",
  awaiting_approval: "Awaiting approval",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

/** A snapshot step the run has not reached (and, terminal, never will). */
export type TimelineStepStatus = WorkflowStepStatus | "not_run";

export const STEP_STATUS_LABEL: Record<TimelineStepStatus, string> = {
  pending: "Pending",
  running: "Running",
  awaiting_approval: "Awaiting approval",
  completed: "Completed",
  failed: "Failed",
  skipped: "Skipped",
  not_run: "Not run",
};

export const AUTONOMY_LABEL: Record<AutonomyLevel, string> = {
  supervised: "Supervised",
  autonomous: "Autonomous",
};

/** The visual register a status renders in (dot color on the status pill). */
export type StatusTone = "positive" | "attention" | "negative" | "neutral";

export function runStatusTone(status: WorkflowRunStatus): StatusTone {
  switch (status) {
    case "completed":
      return "positive";
    case "pending":
    case "running":
    case "awaiting_approval":
      return "attention";
    case "failed":
      return "negative";
    case "cancelled":
      return "neutral";
  }
}

export function stepStatusTone(status: TimelineStepStatus): StatusTone {
  switch (status) {
    case "completed":
      return "positive";
    case "running":
    case "awaiting_approval":
      return "attention";
    case "failed":
      return "negative";
    default:
      // pending / skipped / not_run — quiet, nothing to react to.
      return "neutral";
  }
}

/** True for the in-motion statuses whose pill dot gently pulses. */
export function statusPulses(status: WorkflowRunStatus | TimelineStepStatus): boolean {
  return status === "running" || status === "awaiting_approval";
}

// ---- Step identity (friendly type labels) -------------------------------------

/**
 * The friendly type line for a step: "Agent: <agent name>", the chat-consistent
 * tool label ("Google Drive: create file"), or "Human checkpoint". Reuses the
 * same naming the chat trace and the builder use, so a step reads identically
 * across surfaces. An agent whose row is no longer readable falls back to the
 * bare "Agent" rather than leaking an id.
 */
export function stepTypeLabel(step: WorkflowStep, agentNameById: Map<string, string>): string {
  if (step.type === "agent") {
    const name = agentNameById.get(step.agentId);
    return name ? `Agent: ${name}` : "Agent";
  }
  if (step.type === "tool_action") {
    return toolLabel(`${serverPrefix(step.serverId)}__${step.toolName}`).full;
  }
  return "Human checkpoint";
}

// ---- The timeline (snapshot ∪ step-run rows) ----------------------------------

/** One persisted workflow_step_runs row, as the run view reads it. */
export type StepRunRow = {
  step_id: string;
  step_type: WorkflowStepType;
  status: WorkflowStepStatus;
  input: unknown;
  output: unknown;
  error: string | null;
  approval_mode: StepApprovalMode | null;
  sequence: number;
  started_at: string | null;
  finished_at: string | null;
};

/** One rendered timeline entry: a snapshot step merged with its execution row. */
export type TimelineEntry = {
  stepId: string;
  /** 0-based position in the snapshot (rendered as the 1-based step number). */
  index: number;
  name: string;
  typeLabel: string;
  stepType: WorkflowStepType;
  status: TimelineStepStatus;
  input: unknown;
  output: unknown;
  error: string | null;
  approvalMode: StepApprovalMode | null;
  startedAt: string | null;
  finishedAt: string | null;
};

const TERMINAL_RUN_STATUSES: ReadonlySet<WorkflowRunStatus> = new Set([
  "completed",
  "failed",
  "cancelled",
]);

/**
 * Merge the run's frozen snapshot steps with the persisted step-run rows into
 * the rendered timeline, in definition order. A step with no row hasn't
 * executed: it reads "pending" while the run is alive and "not run" once the
 * run has ended without reaching it.
 */
export function deriveTimeline(
  steps: WorkflowStep[],
  rows: StepRunRow[],
  runStatus: WorkflowRunStatus,
  agentNameById: Map<string, string>,
): TimelineEntry[] {
  const rowByStepId = new Map(rows.map((row) => [row.step_id, row]));
  const unreachedStatus: TimelineStepStatus = TERMINAL_RUN_STATUSES.has(runStatus)
    ? "not_run"
    : "pending";

  return steps.map((step, index) => {
    const row = rowByStepId.get(step.id);
    return {
      stepId: step.id,
      index,
      name: step.name,
      typeLabel: stepTypeLabel(step, agentNameById),
      stepType: step.type,
      status: row ? row.status : unreachedStatus,
      input: row ? row.input : null,
      output: row ? row.output : null,
      error: row ? row.error : null,
      approvalMode: row ? row.approval_mode : null,
      startedAt: row ? row.started_at : null,
      finishedAt: row ? row.finished_at : null,
    };
  });
}

// ---- Approval provenance (the audit trail's "who cleared this?") ---------------

/** A settled decision on a step's approval, resolved for display. */
export type StepDecision = {
  decision: "approved" | "denied";
  deciderName: string | null;
  deciderIsViewer: boolean;
};

/**
 * The provenance line for a checkpoint/write step — the legal question "was
 * this human-reviewed or run autonomously?". `approvalMode` comes from the
 * step's immutable row; `decision` (who decided, from the approval record)
 * personalizes it. A denied step carries no approval_mode, so the denial reads
 * from the decision alone. Null for read steps (no approval involved).
 */
export function stepProvenanceLabel(
  approvalMode: StepApprovalMode | null,
  decision: StepDecision | null,
): string | null {
  if (approvalMode === "auto_proceeded") return "Proceeded automatically";
  if (approvalMode === "human_approved") {
    if (decision?.deciderIsViewer) return "Approved by you";
    if (decision?.deciderName) return `Approved by ${decision.deciderName}`;
    return "Approved by a person";
  }
  if (decision?.decision === "denied") {
    if (decision.deciderIsViewer) return "Denied by you";
    if (decision.deciderName) return `Denied by ${decision.deciderName}`;
    return "Denied by a person";
  }
  return null;
}

// ---- Timing -------------------------------------------------------------------

/** "under 1s" / "12s" / "2m 5s" between two ISO timestamps, or null if open. */
export function formatDuration(
  startedAt: string | null,
  finishedAt: string | null,
): string | null {
  if (!startedAt || !finishedAt) return null;
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return "under 1s";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/** "Jun 6, 2026, 2:14 PM" — the run surfaces' shared timestamp format. */
export function formatRunTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ---- Value rendering (step inputs/outputs, the run input) ----------------------

/**
 * A persisted jsonb value prepared for display: agent text renders as prose,
 * structured values as pretty-printed JSON. Null for empty values (the UI
 * renders nothing rather than an empty block).
 */
export type RenderedValue = { text: string; format: "text" | "json" };

export function renderRunValue(value: unknown): RenderedValue | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    return value.trim().length > 0 ? { text: value, format: "text" } : null;
  }
  try {
    return { text: JSON.stringify(value, null, 2), format: "json" };
  } catch {
    return { text: String(value), format: "json" };
  }
}

/** Values longer than this collapse behind a disclosure in the timeline. */
export const LONG_VALUE_THRESHOLD = 600;

// ---- Pending-write display (PII-safe) ------------------------------------------

/**
 * The PII-safe summary of a pending write's arguments: sorted argument KEY
 * names only, never values — the same bar the chat write-confirmation holds.
 */
export function pendingWriteArgKeys(toolInput: unknown): string[] {
  if (typeof toolInput !== "object" || toolInput === null || Array.isArray(toolInput)) {
    return [];
  }
  return Object.keys(toolInput).sort();
}

/** The friendly label for a pending write's tool, from its persisted route. */
export function pendingWriteToolLabel(
  serverId: string,
  originalToolName: string,
): ToolLabel {
  return toolLabel(`${serverPrefix(serverId)}__${originalToolName}`);
}
