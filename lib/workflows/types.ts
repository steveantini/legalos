/**
 * Workflow data model (Workflows arc, Step 2).
 *
 * A workflow is DECLARATIVE STEP-GRAPH DATA — a serializable definition, never
 * UI-form-state or imperative code. This is the #1 "keep the agentic door open"
 * decision: a future orchestrator agent emits the same validated graph a human
 * composer does, and the SAME engine runs both. Definition is cleanly separated
 * from execution (this file is pure types — no I/O, no engine).
 *
 * ORDER / NEXT (how linear works now and branching is additive): a definition is
 * an ordered `steps` array, and v1 executes them in array order (linear). Each
 * step carries a STABLE `id`, so a future additive `edges` / `next` overlay
 * (keyed by step id) can drive conditional routing WITHOUT a migration — the
 * definition is freeform jsonb and array order is just the default-next. We do
 * not add an unused `next` field now (no fake symmetry); the stable ids are the
 * seam that makes branching additive.
 *
 * STEP TYPES (the typed union, tagged by `type`): agent | tool_action |
 * human_checkpoint. A router/conditional step is REPRESENTABLE later as a new
 * union variant + the edges overlay; no router logic exists in v1.
 */

/**
 * How a step sources a value — its whole input (agent step) or one tool argument
 * (tool_action step). The v1 DEFAULT is `previous` (the immediately-prior step's
 * output; for the FIRST step, `previous` resolves to the run input), so simple
 * linear workflows need almost no mapping config. A step can also pull the
 * original run input, any NAMED PRIOR step's output, or a literal constant.
 */
export type ValueSource =
  | { source: "previous" }
  | { source: "run_input" }
  | { source: "step"; stepId: string }
  | { source: "literal"; value: unknown };

/** Calls a native agent (headless runAgent) on a resolved text input. */
export type AgentStep = {
  id: string;
  type: "agent";
  name: string;
  agentId: string;
  /** Defaults to { source: "previous" } when omitted. */
  inputMapping?: ValueSource;
  /** Optional friendly key for this step's output. Reserved; unused by v1 logic. */
  outputKey?: string;
};

/** Calls a governed MCP tool (executeMcpTool). v1 restricts these to READ tools. */
export type ToolActionStep = {
  id: string;
  type: "tool_action";
  name: string;
  /** The MCP server id (provider_id), resolved from the org's governed targets. */
  serverId: string;
  /** The ORIGINAL (un-namespaced) tool name the server expects. */
  toolName: string;
  /** argName → value source. Omitted/empty → the tool is called with no args. */
  argMapping?: Record<string, ValueSource>;
  outputKey?: string;
};

/**
 * A human approval gate. MODELED + validated in Step 2, but its EXECUTION is a
 * pause: the engine records an 'awaiting_approval' step and STOPS (no auto-
 * approve). The durable pause/resume is Step 3.
 */
export type HumanCheckpointStep = {
  id: string;
  type: "human_checkpoint";
  name: string;
  prompt: string;
};

export type WorkflowStep = AgentStep | ToolActionStep | HumanCheckpointStep;

/** The known step types — the closed set the validator accepts. */
export const WORKFLOW_STEP_TYPES = [
  "agent",
  "tool_action",
  "human_checkpoint",
] as const;

export type WorkflowStepType = (typeof WORKFLOW_STEP_TYPES)[number];

/** The declarative step graph. v1: linear (array order). Branching: additive. */
export type WorkflowDefinition = {
  steps: WorkflowStep[];
};

// ---- Execution records (mirrored by the workflow_runs / workflow_step_runs rows).

export type WorkflowRunStatus =
  | "pending"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type WorkflowStepStatus =
  | "pending"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "skipped";

/** One immutable step-execution record (one workflow_step_runs row). */
export type StepRunRecord = {
  stepId: string;
  stepType: WorkflowStepType;
  sequence: number;
  status: Extract<WorkflowStepStatus, "completed" | "failed" | "awaiting_approval">;
  input: unknown;
  output: unknown;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

/** The outcome of walking a definition: a terminal run status + the step trail. */
export type WorkflowRunOutcome = {
  status: Extract<WorkflowRunStatus, "completed" | "failed" | "awaiting_approval">;
  steps: StepRunRecord[];
  error: string | null;
};
