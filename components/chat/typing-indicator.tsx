"use client";

import { ThinkingGlyph } from "./thinking-glyph";

/**
 * Shown in the assistant lane while waiting for the first SSE event
 * (token OR tool_trace_start) to arrive. Renders the ThinkingGlyph — a
 * pulsing concentric-circles mark that reuses the landing page's motif for
 * brand continuity (commit 1.6, replacing the prior three-dot pulse).
 *
 * The name is kept as TypingIndicator to minimize churn; the contract
 * (renders during ChatInterface's `waitingForFirstToken`) is unchanged.
 * The aria-label says "thinking" rather than "responding" because at this
 * point the assistant has not produced any output yet.
 */
export function TypingIndicator() {
  return (
    <div
      role="status"
      aria-label="Assistant is thinking"
      className="flex items-center px-1 py-2"
    >
      <ThinkingGlyph />
    </div>
  );
}
