import {
  WORKFLOW_STEP_TYPES,
  type WorkflowDefinition,
} from "@/lib/workflows/types";

/**
 * Data-boundary validation for a workflow definition (Workflows arc, Step 2).
 *
 * This is THE door-open safety mechanism: a definition is validated here whether
 * a human composer or a future orchestrator agent produced it — the same gate,
 * the same guarantees. Deterministic safety and agentic openness are the SAME
 * mechanism (the orchestrate.py closed-schema-intent pattern).
 *
 * Pure, with the two registry lookups INJECTED, so it is unit-testable with fakes
 * and reused at run start with live resolvers (the agents table; the org's
 * governed MCP targets). It enforces:
 *   - structural shape: a non-empty steps array, each step with a unique stable
 *     id, a known type, and a name;
 *   - per-type shape: agent.agentId, tool_action.serverId+toolName, checkpoint.prompt;
 *   - capability resolvability + governance: agentId is a runnable agent;
 *     serverId+toolName resolves to a governed tool that is READ-classified
 *     (write tool_actions are rejected — no unattended writes in v1);
 *   - mapping integrity: every { source: "step" } reference points to a PRIOR
 *     step (which also guarantees no cycles in the linear graph).
 */

export type ValidationDeps = {
  /** True when the agentId is an active, runnable native agent in scope. */
  isAgentRunnable: (agentId: string) => Promise<boolean>;
  /** 'read' | 'write' for a governed tool, or null when it is not resolvable. */
  classifyTool: (
    serverId: string,
    toolName: string,
  ) => Promise<"read" | "write" | null>;
};

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

/** True for a non-null, non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validate a single ValueSource against the set of step ids that appear BEFORE
 * this step (priorIds). Returns an error string, or null when valid. A
 * `previous` source is always allowed (the first step's `previous` resolves to
 * the run input at execution time).
 */
function validateValueSource(
  mapping: unknown,
  priorIds: Set<string>,
  label: string,
): string | null {
  if (!isRecord(mapping) || typeof mapping.source !== "string") {
    return `${label}: mapping must be an object with a "source".`;
  }
  switch (mapping.source) {
    case "previous":
    case "run_input":
      return null;
    case "literal":
      return "value" in mapping
        ? null
        : `${label}: a literal source must carry a "value".`;
    case "step": {
      if (!isNonEmptyString(mapping.stepId)) {
        return `${label}: a step source must name a "stepId".`;
      }
      if (!priorIds.has(mapping.stepId)) {
        return `${label}: references step "${mapping.stepId}", which is not a prior step.`;
      }
      return null;
    }
    default:
      return `${label}: unknown mapping source "${String(mapping.source)}".`;
  }
}

export async function validateWorkflowDefinition(
  definition: unknown,
  deps: ValidationDeps,
): Promise<ValidationResult> {
  const errors: string[] = [];

  if (!isRecord(definition) || !Array.isArray(definition.steps)) {
    return { ok: false, errors: ["Definition must be an object with a steps array."] };
  }
  const steps = definition.steps;
  if (steps.length === 0) {
    return { ok: false, errors: ["A workflow must have at least one step."] };
  }

  // Async capability checks accumulate here so the structural pass can run first
  // and contribute the prior-id set each check needs.
  const capabilityChecks: Array<Promise<void>> = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const label = `Step ${i + 1}`;
    if (!isRecord(step)) {
      errors.push(`${label}: must be an object.`);
      continue;
    }

    // Stable id: present + unique. priorIds (for mapping checks) is the set seen
    // strictly before this step, so a step can never reference itself or a later one.
    const priorIds = new Set(seenIds);
    if (!isNonEmptyString(step.id)) {
      errors.push(`${label}: missing a stable "id".`);
    } else if (seenIds.has(step.id)) {
      errors.push(`${label}: duplicate step id "${step.id}".`);
    } else {
      seenIds.add(step.id);
    }

    if (typeof step.type !== "string" || !WORKFLOW_STEP_TYPES.includes(step.type as never)) {
      errors.push(`${label}: unknown step type "${String(step.type)}".`);
      continue;
    }
    if (!isNonEmptyString(step.name)) {
      errors.push(`${label}: missing a "name".`);
    }

    if (step.type === "agent") {
      if (!isNonEmptyString(step.agentId)) {
        errors.push(`${label}: an agent step needs an "agentId".`);
      } else {
        const agentId = step.agentId;
        capabilityChecks.push(
          deps.isAgentRunnable(agentId).then((runnable) => {
            if (!runnable) {
              errors.push(`${label}: agent "${agentId}" is not available or not runnable.`);
            }
          }),
        );
      }
      if (step.inputMapping !== undefined) {
        const err = validateValueSource(step.inputMapping, priorIds, `${label} inputMapping`);
        if (err) errors.push(err);
      }
    } else if (step.type === "tool_action") {
      if (!isNonEmptyString(step.serverId) || !isNonEmptyString(step.toolName)) {
        errors.push(`${label}: a tool action needs a "serverId" and a "toolName".`);
      } else {
        const serverId = step.serverId;
        const toolName = step.toolName;
        capabilityChecks.push(
          deps.classifyTool(serverId, toolName).then((access) => {
            if (access === null) {
              errors.push(`${label}: tool "${toolName}" on "${serverId}" is not available or not governed.`);
            } else if (access !== "read") {
              errors.push(`${label}: tool "${toolName}" is a write action; write tool actions are not allowed in v1.`);
            }
          }),
        );
      }
      if (step.argMapping !== undefined) {
        if (!isRecord(step.argMapping)) {
          errors.push(`${label}: argMapping must be an object of argument names to sources.`);
        } else {
          for (const [argName, mapping] of Object.entries(step.argMapping)) {
            const err = validateValueSource(mapping, priorIds, `${label} argMapping["${argName}"]`);
            if (err) errors.push(err);
          }
        }
      }
    } else if (step.type === "human_checkpoint") {
      if (!isNonEmptyString(step.prompt)) {
        errors.push(`${label}: a human checkpoint needs a "prompt".`);
      }
    }
  }

  await Promise.all(capabilityChecks);

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * Narrow an already-validated definition to the WorkflowDefinition shape. Call
 * ONLY after validateWorkflowDefinition returns ok — it assumes the structural
 * guarantees that validator provides.
 */
export function asWorkflowDefinition(definition: unknown): WorkflowDefinition {
  return definition as WorkflowDefinition;
}
