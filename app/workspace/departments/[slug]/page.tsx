import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AgentGrid } from "@/components/workspace/agent-grid";
import { DepartmentHeader } from "@/components/workspace/department-header";
import { buttonVariants } from "@/components/ui/button";
import {
  getAgentsForDepartmentLaunchpad,
  getDepartmentIfAccessible,
  isCurrentUserOrgAdmin,
  requireAuthUser,
} from "@/lib/auth/access";

/**
 * Aperture department launchpad — content only. Inherits chrome
 * (workspace rail + top bar + footer) from `app/(workspace)/layout.tsx`,
 * lifted there in Session 10a.
 *
 * Two sections (Session 21):
 *
 *   - Department Agents — canonical native agents owned by the
 *     department itself (`is_template = false AND created_by IS NULL`).
 *     Click routes directly to `/agents/<id>` (chat surface). Hidden
 *     entirely when empty — these are system-seeded; absence means the
 *     department has no canonical agents yet, and an empty heading
 *     would read as a layout wart.
 *   - My Agents — user-owned native agents (`is_template = false AND
 *     created_by = userId`). Always-rendered header; empty state shows
 *     the create-new-agent inline prompt.
 *
 * The page header carries a "+ New Agent" button (top-right) — the
 * canonical entry into `/agents/new?department=<slug>` from this
 * surface, replacing the prior Templates section that gave users a
 * gallery of fork-source rows. The Templates section + Blank Agent
 * rows were retired in Session 21; if template-based forking returns,
 * a third section + helper-query bucket land alongside it.
 *
 * Categories within a department remain flat per the architecture doc.
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

  const [{ departmentAgents, myAgents }, canManageTemplates] = await Promise.all([
    getAgentsForDepartmentLaunchpad(department.id, user.id),
    isCurrentUserOrgAdmin(),
  ]);

  // Admins see two side-by-side buttons so creating a department-wide
  // template vs a personal agent is an explicit choice, not an auto-
  // route based on role. Non-admins see a single "+ New agent" button
  // that targets the personal-create path. Both actions hit the same
  // /workspace/agents/new surface; `as_template=true` selects the
  // template form (createTemplateAgentAction) and absence selects the
  // personal form (createAgentAction).
  const newDepartmentAgentHref = `/workspace/agents/new?department=${department.slug}&as_template=true`;
  const newPersonalAgentHref = `/workspace/agents/new?department=${department.slug}`;

  const newAgentAction = canManageTemplates ? (
    <div className="flex flex-wrap gap-2">
      <Link
        href={newDepartmentAgentHref}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <PlusIcon /> New department agent
      </Link>
      <Link
        href={newPersonalAgentHref}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <PlusIcon /> New personal agent
      </Link>
    </div>
  ) : (
    <Link
      href={newPersonalAgentHref}
      className={buttonVariants({ variant: "outline", size: "sm" })}
    >
      <PlusIcon /> New agent
    </Link>
  );

  return (
    <main className="flex flex-col gap-9">
      <DepartmentHeader
        name={department.name}
        description={department.description}
        action={newAgentAction}
      />

      {/* Department Agents — canonical departmental agents, click-to-chat
          directly. Rendered only when at least one canonical agent is
          seeded for the department; an empty section header here would
          read as scaffolding for content that doesn't exist. */}
      {departmentAgents.length > 0 ? (
        <section className="flex flex-col gap-[14px]">
          <header className="flex items-baseline justify-between border-b border-hairline pb-[10px]">
            <h2 className={sectionHeading}>Department Agents</h2>
          </header>
          <AgentGrid
            agents={departmentAgents}
            departmentSlug={department.slug}
            canManageTemplates={canManageTemplates}
          />
        </section>
      ) : null}

      <section className="flex flex-col gap-[14px]">
        <header className="border-b border-hairline pb-[10px]">
          <h2 className={sectionHeading}>My Agents</h2>
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
              You haven&apos;t created any agents yet. Use the New Agent
              button above to start one.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
