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
  /**
   * True when this card represents a system template (is_template = true).
   * Native templates link to the fork form (`/agents/new?fork_from=...`)
   * instead of the chat surface; external templates fall through to the
   * external-link branch unchanged. The 6 Commercial templates remain
   * type='external' until a future session promotes them to native, so
   * external + isTemplate is a real, transitional state — not a bug.
   */
  isTemplate?: boolean;
}

/**
 * Card for a single agent. Three branches:
 *
 * - `type === 'external'`: opens `external_url` in a new tab. Covers the 6
 *   seeded Commercial agents (which carry is_template=true after 8e but
 *   stay external until item #10 in the architecture phasing promotes
 *   them).
 * - `type === 'native' && isTemplate`: links to the fork form at
 *   `/agents/new?department=<slug>&fork_from=<id>`. Covers the per-
 *   department Blank Agent template seeded by 0004.
 * - `type === 'native' && !isTemplate`: links to the chat surface at
 *   `/agents/<id>`. Covers user-created agents and the Test Smoke Agent.
 *
 * Analytics fires on `onPointerDown` for the external branch only — that
 * branch teardown-races on cmd-click and middle-click, while native
 * navigation is in-app and the existing onClick path would suffice. Using
 * pointer-down everywhere keeps the analytics pathway uniform.
 */
export function AgentCard({
  agent,
  departmentSlug,
  isTemplate,
}: AgentCardProps) {
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

  if (agent.type === "external") {
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

  if (isTemplate) {
    return (
      <Link
        href={`/agents/new?department=${departmentSlug}&fork_from=${agent.id}`}
        onPointerDown={handlePointerDown}
        className={className}
      >
        {body}
      </Link>
    );
  }

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
