import Link from "next/link";

type CompactAgentCardProps = {
  id: string;
  name: string;
  departmentName: string;
};

/**
 * Compact agent card for the home's "Recently used" row. A lighter
 * surface than the launchpad's `AgentCard` (which carries kebab, info
 * panel, and fork affordances): this is a pure navigation tile to start
 * a new conversation with the agent.
 *
 * Server component — no interactivity beyond the link. Motion follows
 * the polish #15 three-zone pattern (release tokens at rest for a fast
 * snap, hover tokens for a soft glide, press tokens for spring
 * compression), with a shallower lift than the full department card to
 * suit the smaller surface.
 */
export function CompactAgentCard({
  id,
  name,
  departmentName,
}: CompactAgentCardProps) {
  return (
    <Link
      href={`/workspace/agents/${id}`}
      className="group flex min-h-[80px] flex-col justify-between gap-1 rounded-[14px] border border-border bg-card p-4 transition-[transform,box-shadow,border-color] duration-release ease-release motion-reduce:transition-none hover:duration-hover hover:ease-soft hover:-translate-y-[1px] hover:border-primary/35 hover:shadow-[0_1px_0_rgba(26,24,22,0.02),0_8px_18px_-10px_rgba(26,24,22,0.08)] active:duration-press active:ease-spring active:translate-y-0 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className="line-clamp-1 text-[14.5px] font-medium tracking-[-0.005em] text-foreground">
        {name}
      </span>
      <span className="line-clamp-1 text-[12.5px] tracking-[-0.005em] text-muted-foreground">
        {departmentName}
      </span>
    </Link>
  );
}
