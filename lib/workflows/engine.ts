import type {
  AgentStep,
  StepRunRecord,
  ToolActionStep,
  ValueSource,
  WorkflowDefinition,
  WorkflowRunOutcome,
} from "@/lib/workflows/types";

/**
 * The pure workflow execution engine (Workflows arc, Step 2).
 *
 * Walks a definition's steps in order (linear v1), resolves each step's input via
 * its mapping (default: the previous step's output; the first step's `previous`
 * is the run input), and dispatches by step type to an INJECTED resolver. It
 * touches no DB, model, or MCP server directly — all side effects are injected,
 * so the orchestration logic is unit-testable with fakes (mirroring how runAgent's
 * loop was built). The I/O wrapper (lib/workflows/run.ts) supplies real resolvers
 * and persists the returned step records.
 *
 * Semantics (locked v1):
 *   - LINEAR: array order. (Branching is an additive edges overlay; not here.)
 *   - agent → runAgentStep (the headless runAgent, reads only — Step 1 guarantee).
 *   - tool_action → runToolActionStep (executeMcpTool, READ tools only).
 *   - human_checkpoint → record 'awaiting_approval' and STOP (no auto-approve;
 *     durable resume is Step 3).
 *   - FAIL-STOP: a step failure marks the run failed and stops (no retry, no
 *     partial-continue — a later refinement).
 *   - NEVER THROWS: a thrown resolver is caught and becomes a failed step, so the
 *     engine always returns a typed outcome (mirrors runAgent / executeMcpTool).
 *   - Records ONE immutable StepRunRecord per executed step — the audit trail.
 */

/** What a step resolver returns: a produced output, or a typed failure. */
export type StepExecResult = {
  ok: boolean;
  output: unknown;
  error?: string;
};

export type WorkflowEngineDeps = {
  /** Run an agent step on a resolved text input (wraps the headless runAgent). */
  runAgentStep: (step: AgentStep, input: string) => Promise<StepExecResult>;
  /** Run a tool-action step with resolved args (wraps executeMcpTool, read-only). */
  runToolActionStep: (
    step: ToolActionStep,
    args: Record<string, unknown>,
  ) => Promise<StepExecResult>;
  /** Injected clock (ISO string), so step timing is deterministic in tests. */
  nowIso: () => string;
};

/** The running value context: prior outputs keyed by step id, plus the seam values. */
type ResolveContext = {
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
    default: {
      // Exhaustiveness guard: an unknown source (shouldn't reach a validated
      // definition) fails cleanly rather than throwing.
      return { ok: false, error: "Unknown input mapping source." };
    }
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

/** A finished step record, folded into the trail. */
function record(
  step: { id: string; type: StepRunRecord["stepType"] },
  sequence: number,
  status: StepRunRecord["status"],
  input: unknown,
  output: unknown,
  error: string | null,
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
    startedAt,
    finishedAt,
  };
}

export async function runWorkflow(
  definition: WorkflowDefinition,
  runInput: unknown,
  deps: WorkflowEngineDeps,
): Promise<WorkflowRunOutcome> {
  const steps = definition.steps;
  const ctx: ResolveContext = {
    runInput,
    // The first step's default `previous` is the run input.
    previousOutput: runInput,
    outputs: new Map(),
  };
  const records: StepRunRecord[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const startedAt = deps.nowIso();

    if (step.type === "human_checkpoint") {
      // Pause and STOP — no auto-approve. Step 3 wires durable resume.
      records.push(record(step, i, "awaiting_approval", null, null, null, startedAt, null));
      return { status: "awaiting_approval", steps: records, error: null };
    }

    if (step.type === "agent") {
      const resolved = resolveSource(step.inputMapping ?? { source: "previous" }, ctx);
      if (!resolved.ok) {
        records.push(record(step, i, "failed", null, null, resolved.error, startedAt, deps.nowIso()));
        return { status: "failed", steps: records, error: resolved.error };
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
        records.push(record(step, i, "failed", input, null, error, startedAt, finishedAt));
        return { status: "failed", steps: records, error };
      }
      records.push(record(step, i, "completed", input, res.output, null, startedAt, finishedAt));
      ctx.previousOutput = res.output;
      ctx.outputs.set(step.id, res.output);
      continue;
    }

    // tool_action
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
      records.push(record(step, i, "failed", null, null, argError, startedAt, deps.nowIso()));
      return { status: "failed", steps: records, error: argError };
    }
    let res: StepExecResult;
    try {
      res = await deps.runToolActionStep(step, args);
    } catch {
      res = { ok: false, output: null, error: "The tool action threw unexpectedly." };
    }
    const finishedAt = deps.nowIso();
    if (!res.ok) {
      const error = res.error ?? "The tool action failed.";
      records.push(record(step, i, "failed", args, null, error, startedAt, finishedAt));
      return { status: "failed", steps: records, error };
    }
    records.push(record(step, i, "completed", args, res.output, null, startedAt, finishedAt));
    ctx.previousOutput = res.output;
    ctx.outputs.set(step.id, res.output);
  }

  return { status: "completed", steps: records, error: null };
}
