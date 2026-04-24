"use client";

import { logAgentClick } from "@/lib/analytics/events";

interface AgentCardProps {
  agent: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    external_url: string | null;
  };
  departmentSlug: string;
}

/**
 * Card for a single external agent. Entire card is a link that opens the
 * agent in a new tab.
 *
 * Analytics is logged on `onPointerDown`, not `onClick`: click events are
 * subject to a known race when the user opens a link in a new tab
 * (cmd-click, middle-click, ctrl-click) — the originating tab may tear
 * down the React tree before onClick fires. Pointer-down fires the moment
 * the user begins the interaction and is reliable for all open-in-new-tab
 * modifiers.
 */
export function AgentCard({ agent, departmentSlug }: AgentCardProps) {
  const href = agent.external_url ?? "#";

  function handlePointerDown() {
    logAgentClick({
      agentId: agent.id,
      agentSlug: agent.slug,
      agentName: agent.name,
      departmentSlug,
    });
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onPointerDown={handlePointerDown}
      className="flex min-h-[160px] flex-col justify-center rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <h3 className="text-base font-semibold">{agent.name}</h3>
      {agent.description ? (
        <p className="mt-2 text-sm text-muted-foreground">{agent.description}</p>
      ) : null}
    </a>
  );
}
