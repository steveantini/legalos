"use client";

import { InfoIcon, MoreVerticalIcon } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  restoreAgentAction,
  softDeleteAgentAction,
} from "@/lib/actions/agents";
import { logAgentClick } from "@/lib/analytics/events";

interface AgentCardProps {
  agent: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    type: "external" | "native";
    external_url: string | null;
    /**
     * True when this row is a Pattern B canonical template (migration
     * 0019, Session 27). Templates are surfaced in the Department
     * Agents bucket of the launchpad and route to chat on click;
     * admins get an additional overflow menu for edit/delete.
     */
    is_template: boolean;
    /**
     * Provenance string set on rows imported from external sources
     * (migration 0023). Currently the only producer is the Claude for
     * Legal import script (`scripts/import-c4l-plugin.ts`), which sets
     * `"claude-for-legal:<plugin>/<skill>"`. Null for Canonical
     * templates and personal agents. Used by the delete dialog to
     * branch its copy — C4L deletions don't carry the same forks-
     * survive concern that Canonical deletions do.
     */
    source_origin: string | null;
  };
  departmentSlug: string;
  /**
   * True when the current user can manage templates
   * (super_admin / org_admin per `isCurrentUserOrgAdmin()`). Only
   * meaningful when `agent.is_template` is true — non-template cards
   * ignore this flag. Drives the admin overflow menu (Edit / Delete)
   * on template cards.
   */
  canManageTemplates?: boolean;
  /**
   * True when this card represents an agent the current user owns and
   * can edit / delete. The My agents bucket passes this true; the
   * Approved agents bucket passes it false. Menus only render when
   * explicitly enabled.
   */
  isMyAgent?: boolean;
  /**
   * Click handler for the Info icon (Canonical + C4L cards only). When
   * provided, the card renders an Info button in the top-right corner;
   * click opens the read-only details panel for this agent. The handler
   * is owned by the launchpad client wrapper which manages which agent's
   * panel is open. Omit on cards where the affordance should not appear
   * (personal agents, external agents).
   */
  onOpenDetails?: () => void;
}

/**
 * Agent card for the Aperture department launchpad. Visual vocabulary
 * matches the landing's `<DepartmentCard>` (white card surface, hairline
 * border, hover lift + shadow grow + border darken sharing the asymmetric
 * three-zone motion: `duration-release ease-release` at base, `duration-hover
 * ease-soft` on hover, `duration-press ease-spring` on press) but the body
 * shape is simpler:
 * just name + description, no foot or arrow circle. Agents are leaves
 * (click → chat), not navigational containers.
 *
 * Four render branches:
 *
 * - `type === 'external'` → `<a target="_blank">` to `external_url`.
 * - `agent.is_template && canManageTemplates` → stretched-link card to
 *   chat plus admin overflow menu (Edit routes to the edit form which
 *   admits org-admins on templates; Delete confirms and soft-deletes
 *   via the widened `softDeleteAgentAction`).
 * - `agent.is_template && !canManageTemplates` → plain `<Link>` to chat.
 *   No overflow menu — non-admins chat with the template but can't
 *   manage it. The fork-on-click pattern (Session 8f-A) is retired in
 *   Session 27; the chat surface itself carries the "Customize this"
 *   affordance for non-admins who want a personal copy.
 * - `agent.type === 'native' && !is_template && isMyAgent` →
 *   stretched-link card with user overflow menu (Edit / Delete with
 *   Undo toast).
 * - `agent.type === 'native' && !is_template && !isMyAgent` → plain
 *   `<Link>` to chat (defensive — shouldn't happen in normal launchpad
 *   buckets, but covers the agent shape totally).
 *
 * Analytics fires on `onPointerDown` so cmd-click / middle-click
 * open-in-new-tab behaviors don't tear down the React tree before
 * onClick fires.
 */

// Shared card styling (border, padding, hover lift, press animation, etc.)
// applied to both root anchors (external, defensive link) and wrapper divs
// (admin-template, template-no-manage, my-agent). The press animation is
// guarded with `:has()` so it fires on card-body press but is suppressed
// when the (i) info button or kebab trigger is active. Menu items inside
// the kebab are portaled (see components/ui/dropdown-menu.tsx) and can't
// trigger the card's :active, so they need no guard. CSS `:has()` is
// Baseline 2023 (Safari 15.4+, Chrome 105+, Firefox 121+).
const cardClassName =
  "flex min-h-[160px] flex-col gap-3 rounded-[14px] border border-border bg-card p-[22px] shadow-[0_1px_0_rgba(26,24,22,0.02),0_1px_3px_rgba(26,24,22,0.04),0_8px_24px_-8px_rgba(26,24,22,0.06)] transition-[transform,box-shadow,border-color] duration-release ease-release motion-reduce:transition-none hover:duration-hover hover:ease-soft active:duration-press active:ease-spring active:scale-[0.99] has-[button:active]:!scale-100 hover:-translate-y-[2px] hover:border-primary/35 hover:shadow-[0_1px_0_rgba(26,24,22,0.03),0_4px_8px_rgba(26,24,22,0.06),0_22px_38px_-12px_rgba(26,24,22,0.12),0_8px_24px_-8px_rgba(59,86,128,0.12)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const stretchedLinkClassName =
  "absolute inset-0 z-10 rounded-[14px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function AgentCard({
  agent,
  departmentSlug,
  canManageTemplates,
  isMyAgent,
  onOpenDetails,
}: AgentCardProps) {
  function handlePointerDown() {
    logAgentClick({
      agentId: agent.id,
      agentSlug: agent.slug,
      agentName: agent.name,
      departmentSlug,
    });
  }

  // Title reserves right-padding for the absolute-positioned affordances
  // in the top-right corner so long names don't collide with the icons:
  //   - "" — no icon, no kebab (external + defensive plain link)
  //   - "pr-8" — info icon only at right-3 (non-admin Canonical/C4L)
  //   - "pr-16" — info icon at right-11 + kebab at right-2 (admin
  //              templates, owner-mode personal agents)
  // Description text below the icon's vertical band doesn't need
  // padding — the icon is anchored to the top-right corner only.
  const renderBody = (titlePadding: string) => (
    <>
      <h3
        className={`text-[19px] font-medium leading-[1.15] tracking-[-0.018em] text-foreground ${titlePadding}`}
      >
        {agent.name}
      </h3>
      {agent.description ? (
        <p className="text-[13px] leading-[1.45] text-muted-foreground">
          {agent.description}
        </p>
      ) : null}
    </>
  );

  if (agent.type === "external") {
    return (
      <a
        href={agent.external_url ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        onPointerDown={handlePointerDown}
        aria-label={`Open ${agent.name} (external)`}
        className={cardClassName}
      >
        {renderBody("")}
      </a>
    );
  }

  // Template branches (Session 27 + read-only details panel)
  if (agent.is_template) {
    if (canManageTemplates) {
      return (
        <EditableAgentCard
          agent={agent}
          mode="admin-template"
          onPointerDownLink={handlePointerDown}
          body={renderBody("pr-16")}
          onOpenDetails={onOpenDetails}
        />
      );
    }
    // Non-admin viewing a Canonical or C4L card. Stretched-link pattern
    // so the absolute-positioned Info button can intercept its own click
    // without nesting a <button> inside a <Link> (invalid HTML, fragile
    // interaction). The Info button is rendered above the link via z
    // index; the link still covers the rest of the card.
    //
    // `group` on the outer container drives the card-level hover-reveal
    // for the Info button (see `InfoIconButton` below).
    return (
      <div className={`group relative ${cardClassName}`}>
        <div className="pointer-events-none">{renderBody("pr-8")}</div>
        <Link
          href={`/workspace/agents/${agent.id}`}
          aria-label={`Open ${agent.name}`}
          className={stretchedLinkClassName}
          onPointerDown={handlePointerDown}
        />
        {onOpenDetails ? (
          <InfoIconButton agentName={agent.name} onClick={onOpenDetails} />
        ) : null}
      </div>
    );
  }

  // Defensive plain link for native + non-template + non-myAgent (shouldn't
  // happen in normal launchpad buckets but covers the agent shape totally).
  if (!isMyAgent) {
    return (
      <Link
        href={`/workspace/agents/${agent.id}`}
        onPointerDown={handlePointerDown}
        aria-label={`Open ${agent.name}`}
        className={cardClassName}
      >
        {renderBody("")}
      </Link>
    );
  }

  // Personal agent (owner view). Same overflow-menu pattern as
  // admin-template cards: kebab on the right for Edit/Delete, info
  // icon to its left when onOpenDetails is wired. Title needs the
  // same pr-16 reserve as admin-template to clear both icons.
  return (
    <EditableAgentCard
      agent={agent}
      mode="my-agent"
      onPointerDownLink={handlePointerDown}
      body={renderBody("pr-16")}
      onOpenDetails={onOpenDetails}
    />
  );
}

/**
 * Small Info-icon button overlaid on Canonical / C4L / personal cards.
 * Calls `onClick` (which opens the details panel for this agent) while
 * preventing the surrounding card's stretched link from following.
 * Quiet at rest (40% opacity); brightens on hover. Generous hit target
 * (28px square) around the 14px glyph so the affordance is easy to tap
 * on touch devices, where there is no hover state.
 *
 * Position varies by context:
 *   - `right-3 top-3` when alone in the corner (non-admin Canonical /
 *     C4L cards; no kebab present, no alignment target).
 *   - `right-9 top-2` when paired with a kebab menu (admin templates,
 *     personal agents owned by the viewer). Matches the kebab's
 *     `top-2` for horizontal alignment and sits tight to it (~12px
 *     visual gap) so the two read as a single control cluster.
 */
function InfoIconButton({
  agentName,
  onClick,
  withMenuOffset = false,
}: {
  agentName: string;
  onClick: () => void;
  withMenuOffset?: boolean;
}) {
  const positionClass = withMenuOffset ? "right-9 top-2" : "right-3 top-3";
  // Hover-reveal: `opacity-40` at rest; `group-hover:opacity-100` lifts
  // the icon to full when the parent card is hovered (paired with the
  // kebab so the cluster reads as a single control). `hover:opacity-100`
  // also handles direct hover for cases where group-hover doesn't fire
  // (e.g., touch). `focus-visible:opacity-100` keeps the icon visible
  // for keyboard users when it has focus, even if the card isn't being
  // hovered.
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      aria-label={`View details for ${agentName}`}
      className={`absolute ${positionClass} z-20 grid h-7 w-7 place-items-center rounded-md opacity-40 transition-opacity group-hover:opacity-100 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
    >
      <InfoIcon className="h-3.5 w-3.5 text-muted-foreground" />
    </button>
  );
}

interface EditableAgentCardProps {
  agent: AgentCardProps["agent"];
  /**
   * Copy and stakes vary by mode:
   *
   *   - "my-agent": a user-owned agent. Delete dialog scopes to the
   *     individual; toast surfaces an Undo action.
   *   - "admin-template": a system template visible to every user in
   *     the department. Delete dialog highlights org-wide impact;
   *     forked copies remain unaffected. Toast still surfaces Undo —
   *     the 30-day restore window is uniform across types.
   */
  mode: "my-agent" | "admin-template";
  onPointerDownLink: () => void;
  body: React.ReactNode;
  /**
   * Optional details-panel handler. Surfaces an Info icon left of the
   * overflow menu on admin-template cards (Canonical + C4L). Omitted
   * for my-agent cards — owners already see everything in the edit
   * form, so a peek surface would be redundant.
   */
  onOpenDetails?: () => void;
}

function EditableAgentCard({
  agent,
  mode,
  onPointerDownLink,
  body,
  onOpenDetails,
}: EditableAgentCardProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const isAdminMode = mode === "admin-template";
  const isC4L =
    agent.source_origin?.startsWith("claude-for-legal:") ?? false;

  // Three variants of the delete confirmation copy. Two-sentence pattern
  // from ux-writing.md: state the consequence + name the affected thing
  // + give the recovery window.
  //
  //   1. Canonical (admin-template, not C4L) — keeps the forks-survive
  //      reassurance (per D-041 + Step A.2 Thread 10). Admins forking
  //      from a department template is the standard workflow; the line
  //      is load-bearing for the actual concern.
  //
  //   2. C4L (admin-template, source_origin starts with
  //      "claude-for-legal:") — drops the forks line as noise. The C4L
  //      hybrid-edit pattern (commits around source_origin) lets users
  //      customize model / references / export_format in place without
  //      forking, so a forked-from-C4L agent is rare in practice and
  //      mentioning it trains users to worry about a workflow that
  //      isn't theirs.
  //
  //   3. My-agent (personal, owner-deletable) — forks concept doesn't
  //      apply. Personal agents are leaves of the agent tree.
  let dialogTitle: string;
  let dialogBody: ReactNode;

  if (isAdminMode && isC4L) {
    dialogTitle = "Delete Claude for Legal agent?";
    dialogBody = (
      <>
        <strong>{agent.name}</strong> will be moved to the trash. Other
        users will no longer see it on the department launchpad. You can
        restore it within 30 days.
      </>
    );
  } else if (isAdminMode) {
    dialogTitle = "Delete approved agent?";
    dialogBody = (
      <>
        <strong>{agent.name}</strong> will be moved to the trash. Other
        users will no longer see it on the department launchpad. Their
        forked copies are unaffected. You can restore it within 30 days.
      </>
    );
  } else {
    dialogTitle = "Delete this agent?";
    dialogBody = (
      <>
        <strong>{agent.name}</strong> will be moved to the trash. You can
        restore it within 30 days.
      </>
    );
  }

  function onConfirmDelete() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("agent_id", agent.id);
      const result = await softDeleteAgentAction(formData);
      setDeleteOpen(false);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      const toastMessage = isAdminMode
        ? `${result.agentName} deleted from launchpad`
        : `${result.agentName} deleted`;

      toast(toastMessage, {
        action: {
          label: "Undo",
          onClick: async () => {
            const restoreFormData = new FormData();
            restoreFormData.set("agent_id", result.agentId);
            const restoreResult = await restoreAgentAction(restoreFormData);
            if (!restoreResult.ok) {
              toast.error(restoreResult.error);
            } else {
              toast.success("Restored.");
            }
          },
        },
      });
    });
  }

  return (
    <>
      <div className={`group relative ${cardClassName}`}>
        <div className="pointer-events-none">{body}</div>
        <Link
          href={`/workspace/agents/${agent.id}`}
          aria-label={`Open ${agent.name}`}
          className={stretchedLinkClassName}
          onPointerDown={onPointerDownLink}
        />
        {onOpenDetails ? (
          <InfoIconButton
            agentName={agent.name}
            onClick={onOpenDetails}
            withMenuOffset
          />
        ) : null}
        {/* Kebab wrapper mirrors the InfoIconButton's hover-reveal so the
            two controls share a single visibility model. `focus-within:
            opacity-100` (vs. focus-visible on the button itself)
            captures keyboard focus on the trigger button inside this
            wrapper. */}
        <div className="pointer-events-auto absolute right-2 top-2 z-20 opacity-40 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" />}
              aria-label={`Actions for ${agent.name}`}
            >
              <MoreVerticalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                render={<Link href={`/workspace/agents/${agent.id}/edit`} />}
              >
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={(event) => {
                  event.preventDefault();
                  setDeleteOpen(true);
                }}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirmDelete}
              disabled={pending}
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
