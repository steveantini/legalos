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

type RailLeaf = {
  label: string;
  slug: string;
  /**
   * If present, the leaf routes to this real URL. When absent, the
   * renderer falls back to `/workspace/coming-soon/<slug>` — used for
   * leaves whose destination surface hasn't been built yet.
   */
  href?: string;
};

type RailGroup = {
  caption: string;
  leaves: ReadonlyArray<RailLeaf>;
};

/**
 * Captioned resource groups under the DEPARTMENTS section in the rail.
 * Each group has a caption and one or more leaves; each leaf either
 * points at a real route (`href`) or falls back to
 * `/workspace/coming-soon/<slug>` for surfaces that haven't been built
 * yet.
 *
 * Session 31 introduced the four-category structure (Knowledge /
 * Workflows / Integrations / Help); the multi-leaf shape was added in
 * the follow-up so the rail can express each category's intended
 * subsurface layout even before those subsurfaces ship. Knowledge has
 * three planned leaves (Research / Vault / Sources, per the Session 32
 * reshape) — none have real routes yet, all fall back to coming-soon.
 * The other three categories each have two leaves; the first leaf in
 * each is a real route (the Session 31 placeholder pages), the second
 * falls back to coming-soon.
 *
 * The "My Workflows" leaf was renamed from the Session 31 follow-up's
 * "All Workflows" — the list contains workflows the user / org has
 * authored, not every workflow in the world, so "My" is the more
 * honest label.
 */
const RESOURCE_GROUPS: ReadonlyArray<RailGroup> = [
  {
    caption: "Knowledge",
    leaves: [
      { label: "Research", slug: "knowledge" },
      { label: "Vault", slug: "knowledge-vault" },
      { label: "Sources", slug: "knowledge-sources" },
    ],
  },
  {
    caption: "Workflows",
    leaves: [
      { label: "My Workflows", slug: "workflows", href: "/workspace/workflows" },
      { label: "Template Library", slug: "workflows-templates" },
    ],
  },
  {
    caption: "Integrations",
    leaves: [
      {
        label: "Connections",
        slug: "integrations",
        href: "/workspace/integrations",
      },
      { label: "Marketplace", slug: "integrations-marketplace" },
    ],
  },
  {
    caption: "Help",
    leaves: [
      { label: "Guides", slug: "help", href: "/workspace/help" },
      { label: "What’s New", slug: "help-whats-new" },
    ],
  },
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
          + one or more leaves; each leaf links to its real route when
          `leaf.href` is set, otherwise falls back to a coming-soon page
          for that slug. The parent <nav>'s gap-[22px] gives the same
          inter-group rhythm the DEPARTMENTS group uses, and gap-px
          inside each group tightens the caption-to-leaves relationship.
          Always render — captions are static, no empty-state guard
          needed. */}
      {RESOURCE_GROUPS.map((group) => (
        <div key={group.caption} className="flex flex-col gap-px">
          <p className={`${captionLabel} mx-2 mb-2`}>{group.caption}</p>
          {group.leaves.map((leaf) => (
            <WorkspaceNavLink
              key={leaf.slug}
              href={leaf.href ?? `/workspace/coming-soon/${leaf.slug}`}
              match="exact"
              className={linkBase}
              activeClassName={`${linkBase} ${linkActive}`}
            >
              {leaf.label}
            </WorkspaceNavLink>
          ))}
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
