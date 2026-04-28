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
 */
export function ChatEmptyState({
  agentName,
  agentDescription,
}: ChatEmptyStateProps) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-start gap-3 px-2 py-12 text-left">
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
  );
}
