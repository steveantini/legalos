import Link from "next/link";

type ConversationCardProps = {
  conversationId: string;
  agentId: string;
  agentName: string;
  snippet: string | null;
  /** ISO timestamp of the conversation's last activity. */
  lastActivityAt: string;
};

/**
 * Renders a coarse relative time ("just now", "5m ago", "3h ago",
 * "2d ago", else a locale date). Computed at render; since the card is a
 * server component the string is produced once server-side and not
 * re-derived on the client, so there is no hydration mismatch.
 */
function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Conversation card for the home's "Continue working" row. Deep-links
 * back into the chat surface at the exact conversation (`?c=<id>`).
 * Adopts the full department-card hover treatment from polish #15 (-2px
 * lift, the slate-blue-tinted shadow). Conversation titles are never
 * populated in this product, so the agent name is the primary label and
 * the first user message (truncated upstream) is the supporting snippet.
 */
export function ConversationCard({
  conversationId,
  agentId,
  agentName,
  snippet,
  lastActivityAt,
}: ConversationCardProps) {
  return (
    <Link
      href={`/workspace/agents/${agentId}?c=${conversationId}`}
      className="group flex min-h-[120px] flex-col gap-2 rounded-xl border border-border bg-card p-5 transition-[transform,box-shadow,border-color] duration-release ease-release motion-reduce:transition-none hover:duration-hover hover:ease-soft hover:-translate-y-[2px] hover:border-primary/35 hover:shadow-[0_1px_0_rgba(26,24,22,0.03),0_4px_8px_rgba(26,24,22,0.06),0_22px_38px_-12px_rgba(26,24,22,0.12),0_8px_24px_-8px_rgba(59,86,128,0.12)] active:duration-press active:ease-spring active:translate-y-0 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="line-clamp-1 text-[14.5px] font-medium tracking-[-0.005em] text-foreground">
          {agentName}
        </span>
        <span className="shrink-0 text-[12px] tracking-[-0.005em] text-muted-foreground">
          {formatRelative(lastActivityAt)}
        </span>
      </div>
      {snippet ? (
        <p className="line-clamp-2 text-[13.5px] leading-[1.45] text-muted-foreground">
          {snippet}
        </p>
      ) : null}
    </Link>
  );
}
