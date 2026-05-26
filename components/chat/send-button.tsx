import { ArrowUp, Square } from "lucide-react";

import { cn } from "@/lib/utils";

interface SendButtonProps {
  /** Send handler, used in the idle (non-streaming) state. */
  onClick: () => void;
  /** Stop handler, used while streaming. When absent, the button never
   *  enters its stop state (the caller controls that via `streaming`). */
  onStop?: () => void;
  /** Disables the send action (e.g. empty composer). Ignored while streaming
   *  so the stop action stays clickable. */
  disabled?: boolean;
  /** True while the assistant is generating: the button becomes a stop
   *  control. */
  streaming?: boolean;
  className?: string;
}

/**
 * The composer's send / stop affordance — a single circle that handles both
 * actions so there is no jarring button swap. Idle: solid primary-fill circle
 * with a white upward arrow (chat-native send direction). Streaming: the
 * colors invert inside the same circle — white fill with a thin border and a
 * blue (primary) stop square. Click sends when idle, stops when streaming.
 *
 * Intentionally does NOT use the concentric-circles motif from the landing
 * page and ThinkingGlyph — that mark is reserved for high-impact moments
 * (marketing identity, agent thinking) so it stays meaningful.
 *
 * Motion uses the polish #15 token family shared across the rail and cards:
 * a fast release at base, the slower soft curve on hover, a quick press on
 * active. The fill / border / text colors are in the transition list so the
 * idle↔streaming inversion animates rather than snaps (the icon itself swaps
 * instantly). Reduced motion drops all transitions.
 *
 * States:
 *   - Idle rest: solid primary fill, white arrow, subtle shadow.
 *   - Idle hover: brightness-110 lighten (a shade up, matching Claude.ai).
 *   - Idle disabled (empty input): same fill, not-allowed cursor, no hover.
 *   - Streaming: white fill + border, blue stop square; clickable (stops).
 *   - Active (mousedown): scale-95 for tactile press feedback.
 */
export function SendButton({
  onClick,
  onStop,
  disabled,
  streaming,
  className,
}: SendButtonProps) {
  const handleClick = streaming && onStop ? onStop : onClick;

  return (
    <button
      type="button"
      onClick={handleClick}
      // Never disabled while streaming — the stop action must stay clickable.
      disabled={disabled && !streaming}
      aria-label={streaming ? "Stop generating" : "Send message"}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full shadow-sm",
        streaming
          ? "border border-border-strong bg-background text-primary"
          : "bg-primary text-primary-foreground",
        "transition-[transform,filter,background-color,border-color,color] duration-release ease-release motion-reduce:transition-none",
        "hover:brightness-110 hover:duration-hover hover:ease-soft",
        "active:scale-95 active:duration-press",
        "disabled:cursor-not-allowed disabled:hover:brightness-100",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      {streaming ? (
        <Square className="size-3 fill-current" aria-hidden />
      ) : (
        <ArrowUp className="size-4" aria-hidden />
      )}
    </button>
  );
}
