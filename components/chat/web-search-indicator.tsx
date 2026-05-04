import Link from "next/link";

interface WebSearchIndicatorProps {
  agentId: string;
}

/**
 * Composer status indicator for web search (session 17a polish iteration).
 *
 * Renders ONLY when `agent.tools_enabled` includes `"web_search"` — the
 * caller (MessageInput) decides whether to mount this component at all.
 * When mounted, the chip communicates that web search is active for the
 * agent and provides a click-to-edit affordance via a link to the
 * agent's edit form (jump-anchored to the web-search field). Toggling
 * lives exclusively in the edit form; the composer is read-only.
 *
 * Visual treatment matches the slate-blue active state from spec §2.7
 * ("the only slate-blue active-state in the composer"): mono caps,
 * `text-primary`, slate-blue border at 0.2α, slate-blue tint background
 * (`bg-chat-cite-bg` = primary at 0.08α). 180ms ease on color/border-color
 * transitions per spec §4.
 *
 * Composer never owns the toggle state — there's no useState, no
 * useTransition, no server action. The prior `WebSearchToggle` (with
 * its `updateAgentWebSearchAction` round-trip) was removed alongside
 * this rename.
 */
export function WebSearchIndicator({ agentId }: WebSearchIndicatorProps) {
  return (
    <Link
      href={`/agents/${agentId}/edit#web-search`}
      aria-label="Web search is on for this agent. Click to edit."
      className="inline-flex items-center gap-2 rounded-[7px] border border-primary/20 bg-chat-cite-bg px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.05em] text-primary transition-[background-color,color,border-color] duration-[180ms] ease hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span aria-hidden className="h-[6px] w-[6px] rounded-full bg-current" />
      Web search
    </Link>
  );
}
