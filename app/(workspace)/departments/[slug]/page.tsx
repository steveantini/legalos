import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AgentGrid } from "@/components/workspace/agent-grid";
import { DepartmentHeader } from "@/components/workspace/department-header";
import {
  getAgentsForDepartmentLaunchpad,
  getDepartmentIfAccessible,
  requireAuthUser,
} from "@/lib/auth/access";

/**
 * Aperture department launchpad — content only. Inherits chrome
 * (workspace rail + top bar + footer) from `app/(workspace)/layout.tsx`,
 * lifted there in Session 10a.
 *
 * Two sections per the Session 8f-A IA: system Templates and the user's
 * own My Agents. Categories within a department remain flat per the
 * architecture doc.
 *
 * Auth: `requireAuthUser` (cached via 10a) gates and provides the user
 * id; `getDepartmentIfAccessible(slug)` returns null on either
 * "doesn't exist" or "no access" — both collapse to `notFound()` to
 * preserve the existence-leak guarantee from D-009.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const department = await getDepartmentIfAccessible(slug);
  return {
    title: department?.name ?? "Department",
  };
}

const sectionHeading =
  "font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground";

const ctaLink =
  "text-[13px] font-medium text-primary transition-colors hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export default async function DepartmentLaunchpadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireAuthUser();
  const { slug } = await params;
  const department = await getDepartmentIfAccessible(slug);

  if (!department) {
    notFound();
  }

  const { templates, myAgents } = await getAgentsForDepartmentLaunchpad(
    department.id,
    user.id,
  );

  const newAgentHref = `/agents/new?department=${department.slug}`;

  return (
    <>
      <DepartmentHeader
        name={department.name}
        description={department.description}
      />

      <section className="flex flex-col gap-[14px]">
        <header className="flex items-baseline justify-between border-b border-hairline pb-[10px]">
          <h2 className={sectionHeading}>Templates</h2>
        </header>
        {templates.length > 0 ? (
          <AgentGrid
            agents={templates}
            departmentSlug={department.slug}
            isTemplate
          />
        ) : (
          <p className="text-[13px] text-muted-foreground">
            No templates available for this department yet.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-[14px]">
        <header className="flex items-baseline justify-between border-b border-hairline pb-[10px]">
          <h2 className={sectionHeading}>My Agents</h2>
          {myAgents.length > 0 ? (
            <Link href={newAgentHref} className={ctaLink}>
              Create new agent →
            </Link>
          ) : null}
        </header>
        {myAgents.length > 0 ? (
          <AgentGrid
            agents={myAgents}
            departmentSlug={department.slug}
            isMyAgent
          />
        ) : (
          <div className="rounded-[14px] bg-muted p-8 text-center">
            <p className="text-[13px] leading-[1.5] text-muted-foreground">
              You haven&apos;t created any agents yet. Pick a template above to
              fork, or start from scratch.
            </p>
            <Link href={newAgentHref} className={`mt-4 inline-block ${ctaLink}`}>
              Create new agent →
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
