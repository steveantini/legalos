import type { AgentStep } from "@/lib/workflows/types";

/**
 * Compose an agent step's user message from its optional plain-language
 * instruction and its resolved mapped input (delight pass D3).
 *
 * The instruction is the per-use DIRECTIVE ("Review this NDA and flag unusual
 * terms"); the mapped input is the CONTENT it works on. They compose into the
 * agent's user message — the agent's stored system prompt (its identity and
 * expertise) is untouched, and prompt-defense wrapping (wrapUserMessage)
 * happens downstream in runAgent exactly as before.
 *
 * Composition shape, chosen to read unambiguously to the model:
 *
 *   <instruction>
 *
 *   Input:
 *   <step_input>
 *   <mapped input>
 *   </step_input>
 *
 * The <step_input> delimiter mirrors the codebase's existing tag-delimitation
 * idiom (prompt-defense's <user_input>), so embedded text in the input never
 * blurs into the directive.
 *
 * BACKWARD COMPATIBILITY is the contract: no instruction (or a blank one)
 * returns the input UNCHANGED, byte for byte — a pre-D3 definition composes to
 * exactly what it always sent. An instruction with no input returns the bare
 * directive (no empty Input block).
 */
export function composeAgentTask(
  instruction: AgentStep["instruction"],
  input: string,
): string {
  const directive = instruction?.trim();
  if (!directive) return input;
  if (input.trim().length === 0) return directive;
  return `${directive}\n\nInput:\n<step_input>\n${input}\n</step_input>`;
}
