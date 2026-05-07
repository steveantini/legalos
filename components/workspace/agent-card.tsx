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
  };
  departmentSlug: string;
  /**
   * True when this card represents a system template (`is_template = true`).
   * Native templates link to the fork form (`/agents/new?fork_from=…`)
   * instead of the chat surface; external templates fall through to the
   * external-link branch unchanged. The 6 Commercial templates remain
   * `type='external'` until a future session promotes them to native, so
   * external + isTemplate is a real, transitional state — not a bug.
   */
  isTemplate?: boolean;
  /**
   * True when this card represents an agent the current user owns and
   * can edit / delete. The Templates query and the My Agents query are
   * separate buckets in `getAgentsForDepartmentLaunchpad`; the page
   * passes this flag to the cards in each bucket. Menus only render
   * when explicitly enabled.
   */
  isMyAgent?: boolean;
}

/**
 * Agent card for the Aperture department launchpad. Visual vocabulary
 * matches the landing's `<DepartmentCard>` (white card surface, hairline
 * border, hover lift + shadow grow + border darken with the same
 * 220ms cubic-bezier(.2,.7,.2,1) timing) but the body shape is simpler:
 * just name + description, no foot or arrow circle. Agents are leaves
 * (click → chat or fork form), not navigational containers.
 *
 * Three render branches:
 *
 * - `type === 'external'` → `<a target="_blank">` to `external_url`
 * - `type === 'native' && isTemplate` → `<Link>` to the fork form
 * - `type === 'native' && !isTemplate && isMyAgent` → stretched-link card
 *   with overflow menu (Edit / Delete with Undo toast). The card body is
 *   pointer-events-none; the link is absolute-positioned to fill the
 *   card; the menu trigger sits at z-20 with pointer-events-auto so its
 *   own clicks register without bubbling.
 * - `type === 'native' && !isTemplate && !isMyAgent` → plain `<Link>` to
 *   the chat surface. (Shouldn't happen in normal usage — the launchpad
 *   query buckets every native non-template into My Agents — but this
 *   keeps the component total over the agent shape.)
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
  isTemplate,
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

  if (isTemplate) {
    return (
      <Link
        href={`/workspace/agents/new?department=${departmentSlug}&fork_from=${agent.id}`}
        onPointerDown={handlePointerDown}
        aria-label={`Fork ${agent.name}`}
        className={cardClassName}
      >
        {body}
      </Link>
    );
  }

  // Native, not a template, not isMyAgent — defensive plain link.
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
    <MyAgentCard
      agent={agent}
      onPointerDownLink={handlePointerDown}
      body={body}
    />
  );
}

interface MyAgentCardProps {
  agent: AgentCardProps["agent"];
  onPointerDownLink: () => void;
  body: React.ReactNode;
}

function MyAgentCard({ agent, onPointerDownLink, body }: MyAgentCardProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();

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

      toast(`${result.agentName} deleted`, {
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
            <DialogTitle>Delete this agent?</DialogTitle>
            <DialogDescription>
              <strong>{agent.name}</strong> will be moved to the trash. You
              can restore it within 30 days.
            </DialogDescription>
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
