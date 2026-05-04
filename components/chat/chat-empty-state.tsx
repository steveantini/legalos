"use client";

interface ChatEmptyStateProps {
  agentName: string;
  agentDescription: string | null;
}

/**
 * Pre-first-message state. Names the agent, surfaces its description, and
 * gives one tip to set expectations for legal-domain users (per ux-writing.md
 * tone guidance).
 *
 * The h2 here is the second-level heading on the chat page; the page itself
 * provides h1.
 *
 * Layout: the chat surface's centering is owned by the page `<main>`
 * (`mx-auto max-w-4xl`); this empty state fills that frame edge-to-edge
 * via `w-full` and centers an inner welcome panel at `max-w-2xl mx-auto`
 * so the panel sits on the same vertical centerline as message bubbles
 * (3xl mx-auto), the composer (3xl mx-auto), and the agent header (4xl,
 * the frame itself). The panel keeps `items-start text-left` so the
 * welcome copy reads left-aligned within the centered panel.
 *
 * Vertical padding stays at `py-12` (vs the populated state's `py-6`)
 * — the empty state benefits from more breathing room, and the
 * vertical position of the first message after transition is naturally
 * higher, which reads as content arriving rather than as a layout shift.
 */
export function ChatEmptyState({
  agentName,
  agentDescription,
}: ChatEmptyStateProps) {
  return (
    <div className="w-full py-12">
      <div className="mx-auto flex max-w-2xl flex-col items-start gap-3 text-left">
        <h2 className="text-lg font-semibold">
          Start a conversation with {agentName}.
        </h2>
        {agentDescription ? (
          <p className="text-sm text-muted-foreground">{agentDescription}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          Tip: Be specific about the matter, the parties, and the document
          type. The assistant works from what you share — give it the context
          you&rsquo;d give a junior colleague.
        </p>
      </div>
    </div>
  );
}
