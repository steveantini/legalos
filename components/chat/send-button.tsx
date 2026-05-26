import { ArrowUp } from "lucide-react";

import { cn } from "@/lib/utils";

interface SendButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * The send affordance for the chat composer: a solid primary-fill circle
 * with a white upward arrow (matching the chat-native send direction).
 *
 * Intentionally does NOT use the concentric-circles motif from the landing
 * page and ThinkingGlyph — that mark is reserved for high-impact moments
 * (marketing identity, agent thinking) so it stays meaningful. The composer
 * send button is constant UI; it earns its polish from disciplined state
 * handling rather than expressive ornament.
 *
 * Motion uses the polish #15 token family shared across the rail and cards:
 * a fast release at base, the slower soft curve on hover, a quick press on
 * active. Reduced motion drops all transitions.
 *
 * States:
 *   - Rest: solid primary fill, white arrow, subtle shadow.
 *   - Hover (enabled): brightness-110 lighten — a shade up rather than a
 *     darken, matching Claude.ai's send button.
 *   - Active (mousedown): scale-95 for tactile press feedback.
 *   - Disabled (empty input): visually identical to rest (solid primary, no
 *     dim); only the not-allowed cursor and suppressed hover signal it.
 */
export function SendButton({ onClick, disabled, className }: SendButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Send message"
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm",
        "transition-[transform,filter] duration-release ease-release motion-reduce:transition-none",
        "hover:brightness-110 hover:duration-hover hover:ease-soft",
        "active:scale-95 active:duration-press",
        "disabled:cursor-not-allowed disabled:hover:brightness-100",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      <ArrowUp className="size-4" aria-hidden />
    </button>
  );
}
