import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DepartmentHeader } from "@/components/workspace/department-header";
import { DepartmentLaunchpadContent } from "@/components/workspace/department-launchpad-content";
import { buttonVariants } from "@/components/ui/button";
import { getUserPreferenceAction } from "@/lib/actions/user-preferences";
import {
  getAgentsForDepartmentLaunchpad,
  getDepartmentIfAccessible,
  isCurrentUserOrgAdmin,
  requireAuthUser,
} from "@/lib/auth/access";
import {
  type CollapsedSectionsValue,
  deptCollapsedSectionsKey,
} from "@/lib/preferences/keys";

/**
 * Aperture department launchpad — content only. Inherits chrome
 * (workspace rail + top bar + footer) from `app/(workspace)/layout.tsx`,
 * lifted there in Session 10a.
 *
 * Three sections (Session 21 + migration 0023 multi-source extension):
 *
 *   - Approved agents — canonical native agents owned by the
 *     department itself (`is_template = true AND source_origin IS NULL`).
 *     Click routes directly to `/agents/<id>` (chat surface). Hidden
 *     entirely when empty.
 *   - Claude for Legal — externally-sourced agents from Anthropic's
 *     open-source legal suite (`source_origin IS NOT NULL`, prefix
 *     `claude-for-legal:`). Always-rendered header; empty state stays
 *     deliberately visible until the C4L import lands.
 *   - My agents — user-owned native agents (`is_template = false AND
 *     source_origin IS NULL AND created_by = userId`). Always-rendered
 *     header; empty state shows the create-new-agent inline prompt.
 *
 * The three sections plus the read-only details panel live in
 * `<DepartmentLaunchpadContent>` (client) so the panel can own its
 * open-state. The page itself stays server-rendered for auth +
 * data-fetching. The panel lazy-fetches `system_prompt`,
 * `tools_enabled`, and attachments via `getAgentDetailsAction` on open,
 * so the department-page RSC payload stays lean (a single C4L import
 * adds ~150KB of authored prompt text per visible agent — kept out of
 * the launchpad query for that reason).
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
    { departmentAgents, externalGroups, myAgents },
    canManageTemplates,
    collapsedPrefResult,
  ] = await Promise.all([
    getAgentsForDepartmentLaunchpad(department.id, user.id),
    isCurrentUserOrgAdmin(),
    getUserPreferenceAction<CollapsedSectionsValue>(
      deptCollapsedSectionsKey(department.slug),
    ),
  ]);

  // Default to empty object (all sections expanded) when:
  //   - The preference doesn't exist for this user (first visit)
  //   - The fetch failed (errors don't block the page; fall back to defaults)
  //   - The stored value isn't an object (malformed; treat as missing)
  const initialCollapsedState: CollapsedSectionsValue =
    collapsedPrefResult.ok &&
    collapsedPrefResult.value &&
    typeof collapsedPrefResult.value === "object" &&
    !Array.isArray(collapsedPrefResult.value)
      ? (collapsedPrefResult.value as CollapsedSectionsValue)
      : {};

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
        <PlusIcon /> New approved agent
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
        externalGroups={externalGroups}
        myAgents={myAgents}
        departmentSlug={department.slug}
        canManageTemplates={canManageTemplates}
        initialCollapsedState={initialCollapsedState}
      />
    </main>
  );
}
