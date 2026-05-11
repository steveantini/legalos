"use client";

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { modelLabel } from "@/lib/llm/model-label";

import { CustomizeTemplateButton } from "./customize-template-button";

/**
 * Rich agent header for the chat surface, per Aperture chat spec §2.1.
 * Replaces the legacy thin-strip `<header>` that lived inline in the
 * chat page (small h1 + Edit link). Variants:
 *
 * Active state (default) — name (Inter Tight 28 / 400 / -0.025em / 1.05)
 * + description (14 / 1.55 / muted-fg, max 60ch) + meta chips row
 * (Department Agent / model / web search / attachment count) + a
 * top-right action chosen by viewer × role.
 *
 * Top-right action (Session 27 — three-way branch):
 *   - `isTemplate && canManageTemplates` → Edit link (admin path —
 *     the edit page admits org-admins on templates).
 *   - `isTemplate && !canManageTemplates` → "Customize" button (calls
 *     `forkAgentFromConversationAction` to create a personal copy
 *     including the current conversation's messages).
 *   - `isOwner && !isTemplate` → Edit link (user owns the agent, can
 *     edit personal copy).
 *   - otherwise → no top-right action.
 *
 * Template chip — renders in the meta chips row when `isTemplate` is
 * true, regardless of viewer. Slate-blue mono-caps chip ("· Department
 * Agent") matching the existing web-search chip vocabulary.
 *
 * Soft-deleted state — wraps in a card with the warn palette banner.
 * No top-right action.
 *
 * Centerline alignment: header content sits at `max-w-3xl mx-auto` to
 * share the conversation column's width. Active `<header>` stays at the
 * full chat-surface width (max-w-4xl) so the border-b reads as a
 * separator between agent context and conversation.
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
  /** Owner-of-user-agent flag (created_by === user.id). */
  isOwner: boolean;
  /** True when this is a Pattern B canonical template (Session 27). */
  isTemplate?: boolean;
  /**
   * True for super_admin / org_admin viewers. Only meaningful with
   * `isTemplate` — chooses Edit vs. Customize in the top-right slot.
   */
  canManageTemplates?: boolean;
  /**
   * Live conversation id from ChatInterface state. Passed to the
   * Customize button so the customize flow can copy the active
   * conversation's messages into the new agent. Null until first turn.
   */
  conversationId?: string | null;
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
  isTemplate = false,
  canManageTemplates = false,
  conversationId = null,
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

  // Top-right action: three-way branch keyed on isTemplate × canManage.
  // Owner-of-user-agent (existing Session 19 path) is the fallback.
  let topRightAction: React.ReactNode = null;
  if (isTemplate && canManageTemplates) {
    topRightAction = (
      <Link
        href={`/workspace/agents/${agent.id}/edit`}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        Edit
      </Link>
    );
  } else if (isTemplate && !canManageTemplates) {
    topRightAction = (
      <CustomizeTemplateButton
        agentId={agent.id}
        conversationId={conversationId}
      />
    );
  } else if (isOwner) {
    topRightAction = (
      <Link
        href={`/workspace/agents/${agent.id}/edit`}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        Edit
      </Link>
    );
  }

  return (
    <header className="mb-7 border-b border-hairline-strong pb-4">
      <div className="mx-auto flex w-full max-w-3xl items-start justify-between gap-4">
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
            {isTemplate ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-chat-cite-bg px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-primary">
                <span
                  aria-hidden
                  className="h-[5px] w-[5px] rounded-full bg-primary"
                />
                Department Agent
              </span>
            ) : null}
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
        {topRightAction}
      </div>
    </header>
  );
}
