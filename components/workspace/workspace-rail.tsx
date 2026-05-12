import { LockIcon } from "lucide-react";
import Link from "next/link";

import { siteConfig } from "@/config/site";
import type {
  AgentBreadcrumbContext,
  DepartmentWithAccess,
} from "@/lib/auth/access";
import {
  ROLE_LABEL,
  getDisplayName,
  getInitials,
  type ProfileShape,
} from "@/lib/workspace/profile";
import {
  captionLabel,
  linkActive,
  linkBase,
} from "@/lib/workspace/rail-styles";

import { WorkspaceNavLink } from "./workspace-nav-link";
import { WorkspaceProfileBlock } from "./workspace-profile-block";

/**
 * Captioned resource groups, each with one placeholder leaf that links
 * to its `/coming-soon/<area>` page. Mirrors the DEPARTMENTS group's
 * "caption + leaves" pattern so the rail reads as a consistent stack
 * of captioned groups rather than a singletons-and-bare-list mix.
 *
 * Inbox was dropped from this list — no route, no rail link. The
 * breadcrumb's RESOURCE_AREA_LABELS and the coming-soon component's
 * AREA_COPY both retain their inbox entries as harmless lookups in
 * case anyone hand-types `/coming-soon/inbox`; nothing in the rail
 * points there anymore.
 */
const RESOURCE_GROUPS: ReadonlyArray<{
  caption: string;
  leafLabel: string;
  slug: string;
}> = [
  { caption: "Knowledge", leafLabel: "Vault", slug: "knowledge" },
  { caption: "Matters", leafLabel: "Dashboard", slug: "matters" },
  { caption: "Resources", leafLabel: "Reference", slug: "resources" },
];

const lockedLink =
  "flex items-center justify-between rounded-lg px-3 py-[7px] text-[13.5px] font-[450] tracking-[-0.005em] text-muted-foreground transition-colors duration-150 hover:bg-hairline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function buildRequestAccessHref(departmentName: string): string {
  return (
    `mailto:${siteConfig.adminEmail}` +
    `?subject=${encodeURIComponent(`Request access to ${departmentName} in legalOS`)}` +
    `&body=${encodeURIComponent(
      `Hi, I'd like to request access to the ${departmentName} department in legalOS.`,
    )}`
  );
}

export function WorkspaceRail({
  departments,
  profile,
  agents,
  isAdmin,
}: {
  departments: DepartmentWithAccess[];
  profile: ProfileShape;
  agents: AgentBreadcrumbContext[];
  isAdmin: boolean;
}) {
  const displayName = getDisplayName(profile);
  const initials = getInitials(displayName);
  const roleLabel = ROLE_LABEL[profile.role];

  return (
    <nav
      aria-label="Workspace"
      className="flex w-[232px] flex-col gap-[22px] overflow-auto border-r border-hairline bg-sidebar px-[14px] py-[22px]"
    >
      {/* Brand mark — clicking returns to /workspace landing. */}
      <Link
        href="/workspace"
        className="flex items-center gap-[10px] rounded-md px-2 pt-[2px] text-[15px] font-semibold tracking-[-0.015em] transition-colors hover:bg-hairline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span
          aria-hidden
          className="h-[7px] w-[7px] rounded-full bg-primary"
        />
        {siteConfig.siteTitle}
      </Link>

      {/* Group 1 — Workspace */}
      <div className="flex flex-col gap-px">
        <WorkspaceNavLink
          href="/workspace"
          match="exact"
          className={linkBase}
          activeClassName={`${linkBase} ${linkActive}`}
        >
          Workspace
        </WorkspaceNavLink>
      </div>

      {/* Group 2 — Departments (Session 29: locked-but-visible).
          Accessible departments render as full-weight WorkspaceNavLink
          rows with prefix-match active state (agent-aware via
          agentsLookup so /agents/<id> highlights the parent dept).
          Locked departments — those the user has no
          user_department_roles row for — render as muted rows with a
          lock icon; clicking opens a department-scoped mailto to the
          configured admin email. The group is hidden entirely only
          when the org has zero departments configured (a degenerate
          state); a user with zero ACCESSIBLE departments still sees
          the group with all entries locked, matching the launchpad's
          visibility-with-permissions principle. */}
      {departments.length > 0 ? (
        <div className="flex flex-col gap-px">
          <p className={`${captionLabel} mx-2 mb-2`}>Departments</p>
          {departments.map((d) => {
            if (d.hasAccess) {
              return (
                <WorkspaceNavLink
                  key={d.id}
                  href={`/workspace/departments/${d.slug}`}
                  match="prefix"
                  className={linkBase}
                  activeClassName={`${linkBase} ${linkActive}`}
                  agentsLookup={agents}
                >
                  {d.name}
                </WorkspaceNavLink>
              );
            }
            return (
              <a
                key={d.id}
                href={buildRequestAccessHref(d.name)}
                aria-label={`${d.name} (locked — request access from your admin)`}
                className={lockedLink}
              >
                <span>{d.name}</span>
                <LockIcon
                  aria-hidden
                  strokeWidth={1.5}
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
              </a>
            );
          })}
        </div>
      ) : null}

      {/* Groups 3..N — Resource groups. Each renders a mono-caps caption
          + one placeholder leaf linking to its coming-soon page. The
          parent <nav>'s gap-[22px] gives the same inter-group rhythm
          the DEPARTMENTS group uses, and gap-px inside each group
          tightens the caption-to-leaf relationship. Always render —
          captions are static, no empty-state guard needed. */}
      {RESOURCE_GROUPS.map(({ caption, leafLabel, slug }) => (
        <div key={slug} className="flex flex-col gap-px">
          <p className={`${captionLabel} mx-2 mb-2`}>{caption}</p>
          <WorkspaceNavLink
            href={`/workspace/coming-soon/${slug}`}
            match="exact"
            className={linkBase}
            activeClassName={`${linkBase} ${linkActive}`}
          >
            {leafLabel}
          </WorkspaceNavLink>
        </div>
      ))}

      <WorkspaceProfileBlock
        initials={initials}
        displayName={displayName}
        roleLabel={roleLabel}
        isAdmin={isAdmin}
      />
    </nav>
  );
}
