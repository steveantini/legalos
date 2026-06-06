import { toolLabel } from "@/lib/chat/tool-display";
import { serverPrefix } from "@/lib/connections/mcp/tool-mapping";
import { toolPickerKey } from "@/lib/workflows/tool-picker-options";
import type { ToolArgSpec } from "@/lib/workflows/capabilities";
import type { ValueSource, WorkflowStep } from "@/lib/workflows/types";

/**
 * Pure view-model helpers for the workflow BUILDER (delight pass D3) — the
 * compose-time sibling of run-view.ts. Presentation derivation only — no I/O,
 * no React — so the plain-language readback and the tool-argument
 * essentials/advanced split are unit-testable without a DOM.
 */

// ---- The compose-time readback --------------------------------------------

/**
 * What the readback needs to know about the org's capabilities, prepared by
 * the builder from the (server-resolved) WorkflowCapabilities it already holds.
 */
export type ReadbackCapabilities = {
  agentNameById: Map<string, string>;
  /** Keyed by toolPickerKey(serverId, toolName). */
  toolByKey: Map<string, { fullLabel: string; access: "read" | "write" }>;
};

/** The plain-language phrase for where a step's input comes from. */
function inputPhrase(
  mapping: ValueSource | undefined,
  index: number,
  steps: WorkflowStep[],
): string {
  const source = mapping ?? { source: "previous" as const };
  switch (source.source) {
    case "previous":
      // The first step's `previous` resolves to the run input at execution.
      return index === 0 ? "the run input" : "the previous step’s output";
    case "run_input":
      return "the run input";
    case "literal":
      return "a fixed value";
    case "step": {
      const position = steps.findIndex((s) => s.id === source.stepId);
      return position >= 0
        ? `the output of step ${position + 1}`
        : "an earlier step’s output";
    }
  }
}

/**
 * One step's plain-language phrase: an agent step reads as "who does what"
 * (its instruction when it has one — the agent-centric ideal — or what it
 * works on when it doesn't), a tool action as its friendly chat-consistent
 * label (with its approval pause made visible), a checkpoint as the pause it
 * is. Unfinished steps read honestly rather than blank.
 */
export function stepReadback(
  step: WorkflowStep,
  index: number,
  steps: WorkflowStep[],
  caps: ReadbackCapabilities,
): string {
  if (step.type === "agent") {
    const name = step.agentId
      ? (caps.agentNameById.get(step.agentId) ?? "An unavailable agent")
      : "An agent you haven’t chosen yet";
    const instruction = step.instruction?.trim();
    if (instruction) return `${name}: ${instruction}`;
    return `${name} works on ${inputPhrase(step.inputMapping, index, steps)}`;
  }
  if (step.type === "tool_action") {
    if (!step.serverId || !step.toolName) {
      return "Take an action with a tool you haven’t chosen yet";
    }
    const tool = caps.toolByKey.get(toolPickerKey(step.serverId, step.toolName));
    const label =
      tool?.fullLabel ??
      toolLabel(`${serverPrefix(step.serverId)}__${step.toolName}`).full;
    return tool?.access === "write"
      ? `${label} (pauses for your approval first)`
      : label;
  }
  return "Pause for your approval";
}

/** The whole workflow as plain-language phrases, one per step, in order. */
export function workflowReadback(
  steps: WorkflowStep[],
  caps: ReadbackCapabilities,
): string[] {
  return steps.map((step, index) => stepReadback(step, index, steps, caps));
}

// ---- Tool arguments: essentials first, the rest behind a disclosure --------

/**
 * Split a tool's arguments into the ESSENTIAL set shown up front and the
 * ADVANCED set tucked behind a disclosure, using the required flag the
 * discovered schema already carries — so a Gmail draft leads with to/subject/
 * body while htmlBody and friends stay out of the way. When a tool declares
 * NO required arguments, everything is essential: collapsing the whole form
 * behind "More options" would leave it empty.
 */
export function splitToolArgs(args: ToolArgSpec[]): {
  essential: ToolArgSpec[];
  advanced: ToolArgSpec[];
} {
  const essential = args.filter((arg) => arg.required);
  if (essential.length === 0) return { essential: args, advanced: [] };
  return { essential, advanced: args.filter((arg) => !arg.required) };
}
