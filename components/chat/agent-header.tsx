import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { modelLabel } from "@/lib/llm/model-label";

/**
 * Rich agent header for the chat surface, per Aperture chat spec §2.1.
 * Replaces the legacy thin-strip `<header>` that lived inline in the
 * chat page (small h1 + Edit link). Two render branches:
 *
 * Active state — name (Inter Tight 28 / 400 / -0.025em / 1.05) +
 * description (14 / 1.55 / muted-fg, max 60ch) + meta chips row
 * (model / web search / attachment count) + Edit link top-right.
 * Total height ≈ 92px. 16px bottom border separation from the
 * message list (`border-b border-border pb-4 mb-4`).
 *
 * Soft-deleted state — wraps in a card (`bg-card-divider`,
 * `border-border-strong`, `rounded-[10px]`). Replaces the meta-chips
 * row with an `archived · transcript retained for record · no new
 * turns accepted` banner in `text-warn-fg`. No Edit link (the chat
 * page's existing `isOwner && !isDeleted` guard already covers this,
 * but defensively suppress here too).
 *
 * Centerline alignment: the header content sits at `max-w-3xl mx-auto`
 * to share the conversation column's width with user cards, assistant
 * prose, the composer, and the error/soft-delete banners. The active
 * state's `<header>` stays at the full chat-surface width (max-w-4xl
 * frame from the page main) so its `border-b` reads as a chat-surface
 * separator between agent context and conversation, with a 64px
 * overhang on each side past the 3xl content. The soft-deleted card
 * narrows to 3xl alongside the conversation column — it's a card
 * block, not a separator, so matching the column reads better than
 * a wider card.
 *
 * Composer disabling on archive is OUT OF SCOPE for session 15 — the
 * banner copy reads as if the composer is disabled, and session 17
 * will land that wiring. The disconnect is acceptable for one session.
 *
 * Server component — no interactivity beyond the Edit `<Link>`.
 */

interface AgentHeaderProps {
  agent: {
    id: string;
    name: string;
    description: string | null;
    model: string | null;
    tools_enabled: unknown;
  };
  attachmentCount: number;
  isOwner: boolean;
  isDeleted: boolean;
}

function isWebSearchOn(toolsEnabled: unknown): boolean {
  return (
    Array.isArray(toolsEnabled) &&
    (toolsEnabled as unknown[]).includes("web_search")
  );
}

export function AgentHeader({
  agent,
  attachmentCount,
  isOwner,
  isDeleted,
}: AgentHeaderProps) {
  if (isDeleted) {
    return (
      <header className="mx-auto mb-4 w-full max-w-3xl rounded-[10px] border border-border-strong bg-card-divider p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-[28px] font-normal leading-[1.05] tracking-[-0.025em] text-foreground">
              {agent.name}
            </h1>
            {agent.description ? (
              <p className="mt-2 max-w-[60ch] text-[14px] leading-[1.55] text-muted-foreground">
                {agent.description}
              </p>
            ) : null}
            <p className="mt-3 text-[12px] text-warn-fg">
              archived · transcript retained for record · no new turns accepted
            </p>
          </div>
        </div>
      </header>
    );
  }

  const model = modelLabel(agent.model);
  const webSearchOn = isWebSearchOn(agent.tools_enabled);

  return (
    <header className="mb-4 border-b border-border pb-4">
      <div className="mx-auto flex max-w-3xl items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[28px] font-normal leading-[1.05] tracking-[-0.025em] text-foreground">
            {agent.name}
          </h1>
          {agent.description ? (
            <p className="mt-2 max-w-[60ch] text-[14px] leading-[1.55] text-muted-foreground">
              {agent.description}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {model ? (
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-caption">
                {model}
              </span>
            ) : null}
            {webSearchOn ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-chat-cite-bg px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-primary">
                <span
                  aria-hidden
                  className="h-[5px] w-[5px] rounded-full bg-primary"
                />
                Web search
              </span>
            ) : null}
            {attachmentCount > 0 ? (
              <span className="font-mono text-[11px] text-caption">
                {attachmentCount} attached
              </span>
            ) : null}
          </div>
        </div>
        {isOwner ? (
          <Link
            href={`/agents/${agent.id}/edit`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Edit
          </Link>
        ) : null}
      </div>
    </header>
  );
}
