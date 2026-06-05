import type {
  AgentStep,
  AutonomyLevel,
  PendingWriteAction,
  SegmentResult,
  StepApprovalMode,
  StepRunRecord,
  ToolActionStep,
  ValueSource,
  WorkflowDefinition,
} from "@/lib/workflows/types";

/**
 * The pure workflow execution engine (Workflows arc, Steps 2-3).
 *
 * Walks a definition's steps in order (linear v1), resolves each step's input via
 * its mapping (default: the previous step's output; the first step's `previous`
 * is the run input), and dispatches by step type to an INJECTED resolver. It
 * touches no DB, model, or MCP server directly — all side effects are injected,
 * so the orchestration is unit-testable with fakes. The I/O wrapper
 * (lib/workflows/run.ts) supplies real resolvers and persists the step records.
 *
 * Step 3 generalizes the engine to PAUSE durably and RESUME across requests
 * (the proven Phase 2 chat write-confirmation pattern, applied to workflow runs):
 *   - human_checkpoint: supervised → pause (record 'awaiting_approval', STOP);
 *     autonomous → auto-proceed (record 'completed', approvalMode 'auto_proceeded').
 *   - tool_action WRITE: the resolver returns `needs_approval` (it does NOT
 *     execute); the engine pauses for approval in EVERY autonomy mode (v1 never
 *     performs an unattended write). The write executes only on approval, via the
 *     resume path's injected executeApprovedWrite.
 *   - reads (agent steps; read tool_actions) execute inline regardless of autonomy.
 *
 * CRITICAL: the pure engine has NO write-execution path. A write can only run
 * through resumeWorkflow's injected executeApprovedWrite, which the I/O layer
 * calls only after a human approval + an atomic at-most-once claim. That is the
 * structural guarantee of "no unattended write."
 *
 * FAIL-STOP on a step failure; NEVER THROWS (a thrown resolver becomes a failed
 * step). One immutable StepRunRecord per executed/paused step — the audit trail.
 */

/** What a step resolver returns: a produced output, or a typed failure. */
export type StepExecResult = {
  ok: boolean;
  output: unknown;
  error?: string;
};

/**
 * A tool_action resolver's outcome: a READ executed inline, or a WRITE that the
 * engine must pause to approve (the resolver resolves the route + classifies but
 * does NOT execute a write).
 */
export type ToolActionOutcome =
  | { kind: "executed"; ok: boolean; output: unknown; error?: string }
  | { kind: "needs_approval"; pendingAction: PendingWriteAction };

export type WorkflowEngineDeps = {
  /** Run an agent step on a resolved text input (wraps the headless runAgent). */
  runAgentStep: (step: AgentStep, input: string) => Promise<StepExecResult>;
  /** Resolve + run a tool-action step: a read executes; a write needs approval. */
  runToolActionStep: (
    step: ToolActionStep,
    args: Record<string, unknown>,
  ) => Promise<ToolActionOutcome>;
  /** Injected clock (ISO string), so step timing is deterministic in tests. */
  nowIso: () => string;
};

/** The running value context: prior outputs keyed by step id, plus the seam values. */
export type ResolveContext = {
  runInput: unknown;
  previousOutput: unknown;
  outputs: Map<string, unknown>;
};

/** Resolve a ValueSource to a concrete value, or a typed failure. */
function resolveSource(
  mapping: ValueSource,
  ctx: ResolveContext,
): { ok: true; value: unknown } | { ok: false; error: string } {
  switch (mapping.source) {
    case "previous":
      return { ok: true, value: ctx.previousOutput };
    case "run_input":
      return { ok: true, value: ctx.runInput };
    case "literal":
      return { ok: true, value: mapping.value };
    case "step": {
      if (!ctx.outputs.has(mapping.stepId)) {
        return { ok: false, error: `No output available for step "${mapping.stepId}".` };
      }
      return { ok: true, value: ctx.outputs.get(mapping.stepId) };
    }
    default:
      return { ok: false, error: "Unknown input mapping source." };
  }
}

/** Coerce a resolved value into the text input an agent step consumes. */
function toStringInput(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** A step-run record, folded into the trail. */
export function makeStepRecord(
  step: { id: string; type: StepRunRecord["stepType"] },
  sequence: number,
  status: StepRunRecord["status"],
  input: unknown,
  output: unknown,
  error: string | null,
  approvalMode: StepApprovalMode | null,
  startedAt: string,
  finishedAt: string | null,
): StepRunRecord {
  return {
    stepId: step.id,
    stepType: step.type,
    sequence,
    status,
    input,
    output,
    error,
    approvalMode,
    startedAt,
    finishedAt,
  };
}

/**
 * Walk the definition from `startIndex`, with a seeded value context, until the
 * run completes, fails, or pauses for an approval. Returns the records produced
 * in this segment and (on pause) what the run is waiting on. Used for both a
 * fresh run (startIndex 0) and a resume continuation (startIndex pausedIndex+1).
 */
export async function runWorkflowSegment(params: {
  definition: WorkflowDefinition;
  autonomy: AutonomyLevel;
  deps: WorkflowEngineDeps;
  startIndex: number;
  ctx: ResolveContext;
}): Promise<SegmentResult> {
  const { definition, autonomy, deps, startIndex, ctx } = params;
  const steps = definition.steps;
  const records: StepRunRecord[] = [];

  for (let i = startIndex; i < steps.length; i++) {
    const step = steps[i];
    const startedAt = deps.nowIso();

    if (step.type === "human_checkpoint") {
      if (autonomy === "autonomous") {
        // Auto-clear the pause-gate (no side effect). Pass the previous output
        // through so a following `previous` mapping still sees the real data.
        records.push(
          makeStepRecord(step, i, "completed", null, ctx.previousOutput, null, "auto_proceeded", startedAt, deps.nowIso()),
        );
        ctx.outputs.set(step.id, ctx.previousOutput);
        continue;
      }
      // supervised → pause for human approval and STOP.
      records.push(makeStepRecord(step, i, "awaiting_approval", null, null, null, null, startedAt, null));
      return {
        status: "awaiting_approval",
        steps: records,
        pending: { kind: "checkpoint", stepId: step.id, sequence: i, prompt: step.prompt },
        error: null,
      };
    }

    if (step.type === "agent") {
      const resolved = resolveSource(step.inputMapping ?? { source: "previous" }, ctx);
      if (!resolved.ok) {
        records.push(makeStepRecord(step, i, "failed", null, null, resolved.error, null, startedAt, deps.nowIso()));
        return { status: "failed", steps: records, pending: null, error: resolved.error };
      }
      const input = toStringInput(resolved.value);
      let res: StepExecResult;
      try {
        res = await deps.runAgentStep(step, input);
      } catch {
        res = { ok: false, output: null, error: "The agent step threw unexpectedly." };
      }
      const finishedAt = deps.nowIso();
      if (!res.ok) {
        const error = res.error ?? "The agent step failed.";
        records.push(makeStepRecord(step, i, "failed", input, null, error, null, startedAt, finishedAt));
        return { status: "failed", steps: records, pending: null, error };
      }
      records.push(makeStepRecord(step, i, "completed", input, res.output, null, null, startedAt, finishedAt));
      ctx.previousOutput = res.output;
      ctx.outputs.set(step.id, res.output);
      continue;
    }

    // tool_action: resolve args, then a read executes inline; a write pauses.
    const args: Record<string, unknown> = {};
    let argError: string | null = null;
    for (const [argName, mapping] of Object.entries(step.argMapping ?? {})) {
      const resolved = resolveSource(mapping, ctx);
      if (!resolved.ok) {
        argError = resolved.error;
        break;
      }
      args[argName] = resolved.value;
    }
    if (argError) {
      records.push(makeStepRecord(step, i, "failed", null, null, argError, null, startedAt, deps.nowIso()));
      return { status: "failed", steps: records, pending: null, error: argError };
    }

    let outcome: ToolActionOutcome;
    try {
      outcome = await deps.runToolActionStep(step, args);
    } catch {
      outcome = { kind: "executed", ok: false, output: null, error: "The tool action threw unexpectedly." };
    }

    if (outcome.kind === "needs_approval") {
      // WRITE: pause for approval in EVERY autonomy mode (v1 never auto-writes).
      records.push(makeStepRecord(step, i, "awaiting_approval", args, null, null, null, startedAt, null));
      return {
        status: "awaiting_approval",
        steps: records,
        pending: { kind: "write", stepId: step.id, sequence: i, pendingAction: outcome.pendingAction },
        error: null,
      };
    }

    const finishedAt = deps.nowIso();
    if (!outcome.ok) {
      const error = outcome.error ?? "The tool action failed.";
      records.push(makeStepRecord(step, i, "failed", args, null, error, null, startedAt, finishedAt));
      return { status: "failed", steps: records, pending: null, error };
    }
    records.push(makeStepRecord(step, i, "completed", args, outcome.output, null, null, startedAt, finishedAt));
    ctx.previousOutput = outcome.output;
    ctx.outputs.set(step.id, outcome.output);
  }

  return { status: "completed", steps: records, pending: null, error: null };
}

/**
 * Convenience for a FRESH supervised run from step 0 (Step 2's entry shape).
 * Seeds the context so the first step's `previous` is the run input.
 */
export function runWorkflow(
  definition: WorkflowDefinition,
  runInput: unknown,
  deps: WorkflowEngineDeps,
  autonomy: AutonomyLevel = "supervised",
): Promise<SegmentResult> {
  return runWorkflowSegment({
    definition,
    autonomy,
    deps,
    startIndex: 0,
    ctx: { runInput, previousOutput: runInput, outputs: new Map() },
  });
}

/** The result of resolving a paused approval and continuing the run. */
export type ResumeResult = {
  /** False when another caller won the atomic claim — this resume is a no-op. */
  claimed: boolean;
  /** The terminal record for the previously-paused step (to UPDATE its row). */
  pausedStepRecord: StepRunRecord | null;
  /** The continuation segment after the paused step (null on deny / write failure). */
  segment: SegmentResult | null;
  /** The run's resulting status. */
  runStatus: "completed" | "failed" | "awaiting_approval" | "cancelled";
};

/**
 * Resume a paused run on a human decision (Workflows arc Step 3). Pure, with the
 * atomic claim, the write execution, and the continuation walk all INJECTED, so
 * the at-most-once + approve/deny logic is unit-testable with fakes.
 *
 *   - claimPaused() performs the ATOMIC pending→resolving claim and returns false
 *     when another caller already claimed it — guaranteeing at-most-once: only
 *     the winner executes the write / continues.
 *   - deny → the paused step is recorded failed; the run is 'cancelled'; STOP.
 *   - approve + checkpoint → the paused step is 'human_approved'; continue.
 *   - approve + write → executeApprovedWrite runs the write (live token re-resolved
 *     inside it); on success 'human_approved' + continue, on failure 'failed' + STOP.
 */
export async function resumeWorkflow(params: {
  definition: WorkflowDefinition;
  autonomy: AutonomyLevel;
  deps: WorkflowEngineDeps;
  pausedIndex: number;
  pausedKind: "checkpoint" | "write";
  pendingAction: PendingWriteAction | null;
  decision: "approve" | "deny";
  ctx: ResolveContext;
  claimPaused: () => Promise<boolean>;
  executeApprovedWrite: (
    action: PendingWriteAction,
  ) => Promise<{ ok: boolean; output: unknown; error?: string }>;
}): Promise<ResumeResult> {
  const {
    definition,
    autonomy,
    deps,
    pausedIndex,
    pausedKind,
    pendingAction,
    decision,
    ctx,
    claimPaused,
    executeApprovedWrite,
  } = params;

  // ATOMIC at-most-once claim. A second concurrent approval loses here and no-ops,
  // so an approved write can never execute twice.
  if (!(await claimPaused())) {
    return { claimed: false, pausedStepRecord: null, segment: null, runStatus: "awaiting_approval" };
  }

  const step = definition.steps[pausedIndex];
  const startedAt = deps.nowIso();

  if (decision === "deny") {
    const record = makeStepRecord(step, pausedIndex, "failed", null, null, "Declined by approver.", null, startedAt, deps.nowIso());
    return { claimed: true, pausedStepRecord: record, segment: null, runStatus: "cancelled" };
  }

  // approve
  let pausedStepRecord: StepRunRecord;
  if (pausedKind === "checkpoint") {
    // Pass the previous output through; a checkpoint produces no new value.
    pausedStepRecord = makeStepRecord(step, pausedIndex, "completed", null, ctx.previousOutput, null, "human_approved", startedAt, deps.nowIso());
    ctx.outputs.set(step.id, ctx.previousOutput);
  } else {
    // write — execute now (the only place a write ever runs).
    if (!pendingAction) {
      const record = makeStepRecord(step, pausedIndex, "failed", null, null, "The pending write action was missing.", "human_approved", startedAt, deps.nowIso());
      return { claimed: true, pausedStepRecord: record, segment: null, runStatus: "failed" };
    }
    let res: { ok: boolean; output: unknown; error?: string };
    try {
      res = await executeApprovedWrite(pendingAction);
    } catch {
      res = { ok: false, output: null, error: "The approved write threw unexpectedly." };
    }
    if (!res.ok) {
      const record = makeStepRecord(step, pausedIndex, "failed", pendingAction.toolInput, null, res.error ?? "The write failed.", "human_approved", startedAt, deps.nowIso());
      return { claimed: true, pausedStepRecord: record, segment: null, runStatus: "failed" };
    }
    pausedStepRecord = makeStepRecord(step, pausedIndex, "completed", pendingAction.toolInput, res.output, null, "human_approved", startedAt, deps.nowIso());
    ctx.previousOutput = res.output;
    ctx.outputs.set(step.id, res.output);
  }

  // Continue from the next step with the updated context.
  const segment = await runWorkflowSegment({
    definition,
    autonomy,
    deps,
    startIndex: pausedIndex + 1,
    ctx,
  });

  return { claimed: true, pausedStepRecord, segment, runStatus: segment.status };
}
