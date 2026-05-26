import { cn } from "@/lib/utils";

/**
 * ThinkingGlyph — a small concentric-circles mark. Pulsing (default) while
 * the assistant is thinking (between send and the first token); static
 * (`pulsing={false}`) as the resting mark left at the latest completed
 * response, matching Claude.ai's logo-at-latest-response pattern.
 *
 * Reuses the landing page's concentric-circles motif (see
 * `components/landing/landing-glyph.tsx`) so the brand identity recurs at a
 * high-impact moment in the product rather than being over-deployed across
 * everyday UI. Implementation mirrors the landing glyph's verified approach:
 * two static reference rings + a center dot + one pulse ring driven by the
 * shared `landing-ring-pulse` keyframe in `app/globals.css` — no new
 * animation infrastructure. The pulse ring carries
 * `transform-box: fill-box` + `transform-origin: center` so its `scale()`
 * expands from the circle's own center, exactly as the landing rings do.
 *
 * Reduced motion: the existing `.landing-ring-pulse` guard in globals.css
 * zeroes the pulse (animation none, opacity 0), leaving the static rings and
 * center dot — a quiet resting glyph for motion-sensitive users.
 *
 * Ring radii (14 / 8 on a 16-radius field) scale the landing's 92 / 64 / 36
 * proportions down to a single-glyph format; tune the rendered size via the
 * `className` (defaults to size-8 / 32px) without touching the viewBox.
 */
interface ThinkingGlyphProps {
  className?: string;
  /**
   * True (default) renders the expanding pulse ring — the agent is actively
   * thinking. False renders only the static rings + center dot, the resting
   * mark left below the latest completed response.
   */
  pulsing?: boolean;
}

export function ThinkingGlyph({
  className,
  pulsing = true,
}: ThinkingGlyphProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-8", className)}
    >
      {/* Static reference rings — the resting concentric motif. */}
      <circle
        cx="16"
        cy="16"
        r="14"
        fill="none"
        stroke="var(--primary)"
        strokeOpacity="0.18"
        strokeWidth="1"
      />
      <circle
        cx="16"
        cy="16"
        r="8"
        fill="none"
        stroke="var(--primary)"
        strokeOpacity="0.18"
        strokeWidth="1"
      />
      {/* Pulse ring — expands from center on the shared keyframe; omitted in
          the resting (non-pulsing) state. */}
      {pulsing ? (
        <circle
          cx="16"
          cy="16"
          r="14"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="1"
          className="landing-ring-pulse"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
      ) : null}
      {/* Center dot — the anchor, matching the landing glyph. */}
      <circle cx="16" cy="16" r="2" fill="var(--primary)" />
    </svg>
  );
}
