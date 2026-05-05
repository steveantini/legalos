"use client";

import { AlertCircleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ChatErrorMessageProps {
  /** Bold first sentence of the message — typically the error category. */
  lead: string;
  /** Sentence of explanation following the lead. */
  body: string;
  onRetry: () => void;
  /** Defaults to "Retry". Used for the trace-card variant ("Retry turn"). */
  retryLabel?: string;
}

/**
 * Shared error-banner component per chat-aperture-spec.md §2.9.
 *
 *   "All errors share the same banner pattern: 1px border
 *    rgba(138,58,58,0.3), bg #f9f0ec, 10px radius. Three-column grid:
 *    16px icon / message / retry button. Icon: 14px circular outline
 *    with `!` glyph in mono. Message: display, #6e2e2e. Bold lead +
 *    sentence explanation. Retry: mono caps button, ghost styling."
 *
 * The "14px circular outline with ! glyph" reads as Lucide AlertCircle
 * in our component vocabulary (per Session 15: Lucide icons OK,
 * decorative emoji not OK). Foreground tone uses `--warn-fg-deep`
 * matching spec §2.9; the icon picks up the same color so it reads as
 * a single cohesive treatment rather than a separate accent layer.
 *
 * No dismiss / close button — errors are resolved by retrying or by
 * sending a new message; they self-clear when the next request
 * succeeds. (The pre-Session-19 ChatErrorBanner had a dismiss `<X>`;
 * the spec rejects it: "Restraint: no scary red, no shake animation.
 * The banner is a conversational acknowledgment, not an alarm.")
 *
 * Three placement contexts, all consuming this same component:
 *
 *   - API error before send — between composer and message list,
 *     push-down (banner takes layout space, not overlay).
 *   - Stream interrupted — appended into the message list as a
 *     synthetic banner-message turn, after the partial assistant
 *     turn that errored. The partial text stays visible as the
 *     failed turn's record; clicking retry discards the partial
 *     and re-fires the user's last message.
 *   - Tool error — rendered inside the expanded ToolTraceCard panel
 *     when a server tool surfaced an error. retryLabel="Retry turn"
 *     so the affordance is unambiguous about what gets re-fired.
 */
export function ChatErrorMessage({
  lead,
  body,
  onRetry,
  retryLabel = "Retry",
}: ChatErrorMessageProps) {
  return (
    <div
      role="alert"
      className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] border border-warn-fg/30 bg-warn-bg px-4 py-3"
    >
      <AlertCircleIcon
        aria-hidden
        className="size-3.5 text-warn-fg-deep"
        strokeWidth={1.5}
      />
      <p className="text-[14px] leading-[1.5] text-warn-fg-deep">
        <span className="font-semibold">{lead}</span>
        {body ? <> {body}</> : null}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRetry}
        className="font-mono text-[11px] uppercase tracking-[0.06em] text-warn-fg-deep hover:bg-warn-fg/10 hover:text-warn-fg-deep"
      >
        {retryLabel}
      </Button>
    </div>
  );
}
