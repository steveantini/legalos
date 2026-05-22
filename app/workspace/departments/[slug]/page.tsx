import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import type { AgentAttachmentRow } from "@/components/workspace/agent-details-panel";
import { DepartmentHeader } from "@/components/workspace/department-header";
import { DepartmentLaunchpadContent } from "@/components/workspace/department-launchpad-content";
import { buttonVariants } from "@/components/ui/button";
import {
  getAgentsForDepartmentLaunchpad,
  getDepartmentIfAccessible,
  isCurrentUserOrgAdmin,
  requireAuthUser,
} from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Aperture department launchpad — content only. Inherits chrome
 * (workspace rail + top bar + footer) from `app/(workspace)/layout.tsx`,
 * lifted there in Session 10a.
 *
 * Three sections (Session 21 + migration 0023 multi-source extension):
 *
 *   - Department Agents — canonical native agents owned by the
 *     department itself (`is_template = true AND source_origin IS NULL`).
 *     Click routes directly to `/agents/<id>` (chat surface). Hidden
 *     entirely when empty.
 *   - Claude for Legal — externally-sourced agents from Anthropic's
 *     open-source legal suite (`source_origin IS NOT NULL`, prefix
 *     `claude-for-legal:`). Always-rendered header; empty state stays
 *     deliberately visible until the C4L import lands.
 *   - My Agents — user-owned native agents (`is_template = false AND
 *     source_origin IS NULL AND created_by = userId`). Always-rendered
 *     header; empty state shows the create-new-agent inline prompt.
 *
 * The three sections plus the read-only details panel live in
 * `<DepartmentLaunchpadContent>` (client) so the panel can own its
 * open-state. The page itself stays server-rendered for auth +
 * data-fetching; it also runs a parallel query for attachments across
 * every visible agent so the panel's References section renders without
 * a second round-trip on open.
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

  const [
    { departmentAgents, externalAgents, myAgents },
    canManageTemplates,
  ] = await Promise.all([
    getAgentsForDepartmentLaunchpad(department.id, user.id),
    isCurrentUserOrgAdmin(),
  ]);

  // Parallel attachments query for every visible agent in the three
  // buckets. RLS scopes via `agent_attachments` policies; the `in()`
  // filter keeps the result set small. Indexed by agent_id in JS so the
  // client wrapper can hand each panel just its own attachment slice.
  const visibleAgentIds = [
    ...departmentAgents.map((a) => a.id),
    ...externalAgents.map((a) => a.id),
    ...myAgents.map((a) => a.id),
  ];

  const attachmentsByAgentId: Record<string, AgentAttachmentRow[]> = {};
  if (visibleAgentIds.length > 0) {
    const supabase = await createSupabaseServerClient();
    const { data: attachmentRows } = await supabase
      .from("agent_attachments")
      .select("agent_id, original_filename")
      .in("agent_id", visibleAgentIds)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    for (const row of (attachmentRows ?? []) as Array<{
      agent_id: string;
      original_filename: string;
    }>) {
      const list = attachmentsByAgentId[row.agent_id] ?? [];
      list.push({ originalFilename: row.original_filename });
      attachmentsByAgentId[row.agent_id] = list;
    }
  }

  // Admins see two side-by-side buttons so creating a department-wide
  // template vs a personal agent is an explicit choice, not an auto-
  // route based on role. Non-admins see a single "+ New agent" button
  // that targets the personal-create path.
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

      <DepartmentLaunchpadContent
        departmentAgents={departmentAgents}
        externalAgents={externalAgents}
        myAgents={myAgents}
        departmentSlug={department.slug}
        canManageTemplates={canManageTemplates}
        attachmentsByAgentId={attachmentsByAgentId}
      />
    </main>
  );
}
