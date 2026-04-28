"use client";

/**
 * Three pulsing dots shown in an assistant-styled bubble while waiting for
 * the first SSE token event. Replaced by the streaming assistant bubble
 * once tokens start arriving.
 *
 * Staggered delays via inline style so the three dots pulse out of phase.
 * Pure CSS animation (animate-pulse from Tailwind) — no JS timer.
 */
export function TypingIndicator() {
  return (
    <div
      role="status"
      aria-label="Assistant is responding"
      className="flex items-center gap-1.5 px-1 py-2"
    >
      <span
        className="size-2 animate-pulse rounded-full bg-muted-foreground/60"
        style={{ animationDelay: "0ms" }}
      />
      <span
        className="size-2 animate-pulse rounded-full bg-muted-foreground/60"
        style={{ animationDelay: "150ms" }}
      />
      <span
        className="size-2 animate-pulse rounded-full bg-muted-foreground/60"
        style={{ animationDelay: "300ms" }}
      />
    </div>
  );
}
