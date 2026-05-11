"use client";

import { MoreVerticalIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
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
   * can edit / delete. The My Agents bucket passes this true; the
   * Department Agents bucket passes it false. Menus only render when
   * explicitly enabled.
   */
  isMyAgent?: boolean;
}

/**
 * Agent card for the Aperture department launchpad. Visual vocabulary
 * matches the landing's `<DepartmentCard>` (white card surface, hairline
 * border, hover lift + shadow grow + border darken with the same
 * 220ms cubic-bezier(.2,.7,.2,1) timing) but the body shape is simpler:
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

const cardClassName =
  "flex min-h-[160px] flex-col gap-3 rounded-[14px] border border-card-border bg-card p-[22px] shadow-[0_1px_0_rgba(26,24,22,0.02),0_1px_3px_rgba(26,24,22,0.04),0_8px_24px_-8px_rgba(26,24,22,0.06)] transition-[transform,box-shadow,border-color] duration-[220ms] ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-[2px] hover:border-primary/35 hover:shadow-[0_1px_0_rgba(26,24,22,0.03),0_4px_8px_rgba(26,24,22,0.06),0_22px_38px_-12px_rgba(26,24,22,0.12),0_8px_24px_-8px_rgba(59,86,128,0.12)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const stretchedLinkClassName =
  "absolute inset-0 z-10 rounded-[14px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function AgentCard({
  agent,
  departmentSlug,
  canManageTemplates,
  isMyAgent,
}: AgentCardProps) {
  function handlePointerDown() {
    logAgentClick({
      agentId: agent.id,
      agentSlug: agent.slug,
      agentName: agent.name,
      departmentSlug,
    });
  }

  const body = (
    <>
      <h3 className="text-[19px] font-medium leading-[1.15] tracking-[-0.018em] text-foreground">
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
        {body}
      </a>
    );
  }

  // Template branches (Session 27)
  if (agent.is_template) {
    if (canManageTemplates) {
      return (
        <EditableAgentCard
          agent={agent}
          mode="admin-template"
          onPointerDownLink={handlePointerDown}
          body={body}
        />
      );
    }
    return (
      <Link
        href={`/workspace/agents/${agent.id}`}
        onPointerDown={handlePointerDown}
        aria-label={`Open ${agent.name}`}
        className={cardClassName}
      >
        {body}
      </Link>
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
        {body}
      </Link>
    );
  }

  return (
    <EditableAgentCard
      agent={agent}
      mode="my-agent"
      onPointerDownLink={handlePointerDown}
      body={body}
    />
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
}

function EditableAgentCard({
  agent,
  mode,
  onPointerDownLink,
  body,
}: EditableAgentCardProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const isAdminMode = mode === "admin-template";
  const dialogTitle = isAdminMode
    ? "Delete Department Agent?"
    : "Delete this agent?";
  // Two-sentence pattern matching ux-writing.md's destructive
  // confirmation rules: state the consequence + name the affected
  // thing + give the recovery window. The admin variant adds the
  // org-wide stakes plus the forks-survive note (per D-041 + Step A.2
  // Thread 10 — forks are independent post-creation).
  const dialogBody = isAdminMode ? (
    <>
      <strong>{agent.name}</strong> will be moved to the trash. Other users
      will no longer see it on the department launchpad. Their forked copies
      are unaffected. You can restore it within 30 days.
    </>
  ) : (
    <>
      <strong>{agent.name}</strong> will be moved to the trash. You can
      restore it within 30 days.
    </>
  );

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
      <div className={`relative ${cardClassName}`}>
        <div className="pointer-events-none">{body}</div>
        <Link
          href={`/workspace/agents/${agent.id}`}
          aria-label={`Open ${agent.name}`}
          className={stretchedLinkClassName}
          onPointerDown={onPointerDownLink}
        />
        <div className="pointer-events-auto absolute right-2 top-2 z-20">
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
