"use client";

/**
 * Three pulsing dots shown in the assistant lane while waiting for the
 * first SSE event (token OR tool_trace_start) to arrive.
 *
 * Animation per chat-aperture-spec.md §4: 1.4s ease-in-out, opacity
 * 0.3 → 1.0, staggered 180ms across dots. Driven by the chat-typing-dot
 * keyframe utility in app/globals.css; prefers-reduced-motion: reduce
 * collapses the keyframe to a static end-state via the global media
 * query so users with motion sensitivity see three quiet dots rather
 * than a pulse.
 */
export function TypingIndicator() {
  return (
    <div
      role="status"
      aria-label="Assistant is responding"
      className="flex items-center gap-1.5 px-1 py-2"
    >
      <span
        className="chat-typing-dot size-2 rounded-full bg-muted-foreground"
        style={{ animationDelay: "0ms" }}
      />
      <span
        className="chat-typing-dot size-2 rounded-full bg-muted-foreground"
        style={{ animationDelay: "180ms" }}
      />
      <span
        className="chat-typing-dot size-2 rounded-full bg-muted-foreground"
        style={{ animationDelay: "360ms" }}
      />
    </div>
  );
}
