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
   * True when this card represents a system template (is_template = true).
   * Native templates link to the fork form (`/agents/new?fork_from=...`)
   * instead of the chat surface; external templates fall through to the
   * external-link branch unchanged. The 6 Commercial templates remain
   * type='external' until a future session promotes them to native, so
   * external + isTemplate is a real, transitional state — not a bug.
   */
  isTemplate?: boolean;
  /**
   * True when this card represents an agent the current user owns and
   * can edit / delete. The Templates query and the My Agents query are
   * separate buckets in `getAgentsForDepartmentSplit`, so the page knows
   * which is which and passes this prop. The Test Smoke Agent (created_by
   * NULL, not a template) is in neither bucket and never reaches this
   * card; menus only render when explicitly enabled.
   */
  isMyAgent?: boolean;
}

const cardClassName =
  "flex min-h-[160px] flex-col justify-center rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md";

const stretchedLinkClassName =
  "absolute inset-0 z-10 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * Card for a single agent. Three branches:
 *
 * - `type === 'external'`: opens `external_url` in a new tab.
 * - `type === 'native' && isTemplate`: links to the fork form.
 * - `type === 'native' && !isTemplate`: links to the chat surface, and
 *   when `isMyAgent` is true, renders an overflow menu with Edit + Delete.
 *
 * The my-agent branch uses the stretched-link pattern: a relative card
 * container with the navigation link absolute-positioned to fill it
 * (z-10), and the overflow-menu button positioned in the top-right corner
 * (z-20). The card body is rendered with pointer-events-none so clicks
 * pass through to the link, while the menu button has pointer-events-auto
 * so its own clicks register without bubbling.
 *
 * Analytics fires on `onPointerDown` so cmd-click / middle-click open-in-
 * new-tab behaviors don't tear down the React tree before onClick fires.
 */
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
      <h3 className="text-base font-semibold">{agent.name}</h3>
      {agent.description ? (
        <p className="mt-2 text-sm text-muted-foreground">{agent.description}</p>
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
        className={`${cardClassName} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
      >
        {body}
      </a>
    );
  }

  if (isTemplate) {
    return (
      <Link
        href={`/agents/new?department=${departmentSlug}&fork_from=${agent.id}`}
        onPointerDown={handlePointerDown}
        className={`${cardClassName} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
      >
        {body}
      </Link>
    );
  }

  // Native, not a template. If isMyAgent: stretched-link card with menu.
  // Otherwise: plain link (covers the Test Smoke Agent's edge case if it
  // ever appears, though the launchpad query no longer surfaces it).
  if (!isMyAgent) {
    return (
      <Link
        href={`/agents/${agent.id}`}
        onPointerDown={handlePointerDown}
        className={`${cardClassName} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
      >
        {body}
      </Link>
    );
  }

  return (
    <MyAgentCard
      agent={agent}
      departmentSlug={departmentSlug}
      onPointerDownLink={handlePointerDown}
      body={body}
    />
  );
}

interface MyAgentCardProps {
  agent: AgentCardProps["agent"];
  departmentSlug: string;
  onPointerDownLink: () => void;
  body: React.ReactNode;
}

function MyAgentCard({
  agent,
  departmentSlug,
  onPointerDownLink,
  body,
}: MyAgentCardProps) {
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
          href={`/agents/${agent.id}`}
          aria-label={`Open ${agent.name}`}
          className={stretchedLinkClassName}
          onPointerDown={onPointerDownLink}
        />
        <div className="absolute right-2 top-2 z-20 pointer-events-auto">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" />}
              aria-label={`Actions for ${agent.name}`}
            >
              <MoreVerticalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                render={<Link href={`/agents/${agent.id}/edit`} />}
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
