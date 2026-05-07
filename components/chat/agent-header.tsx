"use client";

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { modelLabel } from "@/lib/llm/model-label";

/**
 * Rich agent header for the chat surface, per Aperture chat spec §2.1.
 * Replaces the legacy thin-strip `<header>` that lived inline in the
 * chat page (small h1 + Edit link). Three variants:
 *
 * Active state (default) — name (Inter Tight 28 / 400 / -0.025em / 1.05)
 * + description (14 / 1.55 / muted-fg, max 60ch) + meta chips row
 * (model / web search / attachment count) + Edit link top-right.
 *
 * Empty-state variant (Session 19) — when `emptyState` is true, the
 * header drops the model and web-search chips because the §2.8
 * identity panel below carries those facts at full weight as part of
 * the empty-state hierarchy. Same three facts twice in the same
 * viewport reads as redundant noise. Once any message lands
 * (messages.length flips > 0), the header reverts to its full §2.1
 * form because §2.8 is no longer rendered. The transition is plain
 * conditional render — no animations on the chip elements, so the
 * model + web-search chips appear instantly when the first user
 * message lands rather than animating in mid-conversation.
 * Description, attachment count, name, and Edit link remain in both
 * variants; only model + web-search are conditional.
 *
 * Soft-deleted state — wraps in a card (`bg-card-divider`,
 * `border-border-strong`, `rounded-[10px]`). Replaces the meta-chips
 * row with an `archived · transcript retained for record · no new
 * turns accepted` banner in `text-warn-fg`. No Edit link.
 *
 * Centerline alignment: the header content sits at `max-w-3xl mx-auto`
 * to share the conversation column's width with user cards, assistant
 * prose, the composer, and the error/soft-delete banners. The active
 * state's `<header>` stays at the full chat-surface width (max-w-4xl
 * frame from the page main) so its `border-b` reads as a chat-surface
 * separator between agent context and conversation, with a 64px
 * overhang on each side past the 3xl content. The soft-deleted card
 * narrows to 3xl alongside the conversation column.
 *
 * Client component as of Session 19 — moved out of the page's server
 * tree into ChatInterface so the `emptyState` prop can flip live as
 * messages arrive. No interactivity is added beyond what was here
 * before; "use client" is for prop-flow wiring, not for new behavior.
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
  /**
   * True when the conversation has zero messages (the §2.8 identity
   * panel is rendered below). Hides the model + web-search chips to
   * avoid duplicating those facts with the panel's facts row. Default
   * false — populated conversations show the full meta chip set.
   */
  emptyState?: boolean;
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
  emptyState = false,
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
            {model && !emptyState ? (
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-caption">
                {model}
              </span>
            ) : null}
            {webSearchOn && !emptyState ? (
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
            href={`/workspace/agents/${agent.id}/edit`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Edit
          </Link>
        ) : null}
      </div>
    </header>
  );
}
