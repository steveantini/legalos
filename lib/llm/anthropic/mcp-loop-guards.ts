/**
 * Shared guards for the agentic MCP tool-use loop.
 *
 * Extracted so the two callers that run the loop share one source of truth for
 * its bounds: the streaming chat turn (lib/chat/assistant-stream.ts) and the
 * headless runAgent primitive (lib/agents/run-agent.ts, Workflows arc Step 1).
 * Keeping the values here means a workflow agent-step and a chat turn can never
 * drift apart on how many tool rounds or how long a run may take.
 *
 * The values are verbatim from the route's original 2P-6b loop; moving them here
 * is behavior-neutral for chat.
 */

/** Hard cap on model⇄tool rounds in one run, so a tool-thrashing loop can't run away. */
export const MCP_MAX_TOOL_ROUNDS = 8;

/** Wall-clock budget for one run's loop, a backstop independent of the round cap. */
export const MCP_LOOP_WALL_CLOCK_MS = 240_000;
