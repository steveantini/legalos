"use client";

import Link from "next/link";

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
}

/**
 * Card for a single agent. Branches by `agent.type`:
 *
 * - `external` (Phase 1 default): renders an `<a target="_blank">` opening
 *   the configured `external_url` in a new tab.
 * - `native` (Phase 2 onward): renders a Next.js `<Link>` to
 *   `/agents/<id>`, which mounts the in-app chat experience. Same window —
 *   the chat is part of the app, not an external destination.
 *
 * Analytics is logged on `onPointerDown`, not `onClick`. Click events are
 * subject to a known race when the user opens a link in a new tab
 * (cmd-click, middle-click, ctrl-click) — the originating tab may tear
 * down the React tree before `onClick` fires. Pointer-down fires the moment
 * the user begins the interaction and is reliable for all open-in-new-tab
 * modifiers. The native variant doesn't open a new tab, but using
 * pointer-down for both keeps the analytics pathway uniform.
 */
export function AgentCard({ agent, departmentSlug }: AgentCardProps) {
  function handlePointerDown() {
    logAgentClick({
      agentId: agent.id,
      agentSlug: agent.slug,
      agentName: agent.name,
      departmentSlug,
    });
  }

  const className =
    "flex min-h-[160px] flex-col justify-center rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  const body = (
    <>
      <h3 className="text-base font-semibold">{agent.name}</h3>
      {agent.description ? (
        <p className="mt-2 text-sm text-muted-foreground">{agent.description}</p>
      ) : null}
    </>
  );

  if (agent.type === "native") {
    return (
      <Link
        href={`/agents/${agent.id}`}
        onPointerDown={handlePointerDown}
        className={className}
      >
        {body}
      </Link>
    );
  }

  return (
    <a
      href={agent.external_url ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      onPointerDown={handlePointerDown}
      className={className}
    >
      {body}
    </a>
  );
}
