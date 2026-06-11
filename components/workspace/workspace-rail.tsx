import Link from "next/link";

import { siteConfig } from "@/config/site";
import { getUserPreferenceAction } from "@/lib/actions/user-preferences";
import type {
  AgentBreadcrumbContext,
  DepartmentWithAccess,
} from "@/lib/auth/access";
import {
  railGroupsCollapsedKey,
  type RailGroupsCollapsedValue,
} from "@/lib/preferences/keys";
import {
  ROLE_LABEL,
  getDisplayName,
  getInitials,
  type ProfileShape,
} from "@/lib/workspace/profile";
import { type AgentsLookup } from "@/lib/workspace/rail-active";
import { linkActive, linkBase } from "@/lib/workspace/rail-styles";

import { CollapsibleRailGroup } from "./collapsible-rail-group";
import { LockedDepartmentRailRow } from "./locked-department-rail-row";
import { WorkspaceNavLink } from "./workspace-nav-link";
import { WorkspaceProfileBlock } from "./workspace-profile-block";

type RailLeaf = {
  label: string;
  slug: string;
  /**
   * If present, the leaf routes to this URL. When absent, the renderer
   * falls back to `/workspace/coming-soon/<slug>` — used for leaves
   * whose destination surface hasn't been built yet.
   */
  href?: string;
  /**
   * When true, the leaf renders as a plain anchor with `target="_blank"`
   * and `rel="noopener noreferrer"`, opening in a new tab — used for
   * leaves that bridge from the in-product workspace chrome to the
   * marketing surface (e.g., "About legalOS" pointing at `/`). Defaults
   * to false; in-product leaves use the standard `<WorkspaceNavLink>`
   * with active-state matching.
   */
  external?: boolean;
};

type RailGroup = {
  /** Display caption rendered in the group header. */
  caption: string;
  /**
   * Landing route the caption navigates to when clicked. Stated
   * explicitly per group rather than derived from `groupKey` so a future
   * key/route divergence can't silently break navigation.
   */
  landingHref: string;
  /**
   * Persistence key for the group's collapsed state. Must be a field of
   * `RailGroupsCollapsedValue` so the type system catches any group
   * additions that forget to extend the preference shape.
   */
  groupKey: keyof RailGroupsCollapsedValue;
  leaves: ReadonlyArray<RailLeaf>;
};

/**
 * Captioned resource groups under the DEPARTMENTS section in the rail.
 * Each group has a caption, a persistence key (used for collapsed-state
 * storage under `ui:rail:groups_collapsed`), and one or more leaves;
 * each leaf either points at a real route (`href`) or falls back to
 * `/workspace/coming-soon/<slug>` for surfaces that haven't been built
 * yet.
 *
 * Session 31 introduced a multi-category structure (Knowledge /
 * Workflows / Help; Integrations was retired in M7, D-071); the multi-leaf shape was added in
 * the follow-up so the rail can express each category's intended
 * subsurface layout even before those subsurfaces ship. Knowledge
 * carries the settled two-leaf shape (Knowledge arc Step 1): Research
 * (coming-soon) and Collections (live). The former Vault and Sources
 * leaves are retired — Vault dissolved into Collections, Sources was
 * superseded by the connector catalog and its governance.
 *
 * The "My Workflows" leaf was renamed from the Session 31 follow-up's
 * "All Workflows" — the list contains workflows the user / org has
 * authored, not every workflow in the world, so "My" is the more
 * honest label.
 *
 * Leaves can also route externally via the `external: true` flag, which
 * renders the leaf as a plain anchor with `target="_blank"` opening in
 * a new tab — used to bridge from the in-product workspace chrome to
 * the marketing surface (the "About legalOS" leaf in the Help group
 * points at `/`, the landing page). External leaves don't participate
 * in active-state matching — they are never "the current page" from
 * the rail's perspective, so they're filtered out when building the
 * `leaves` prop passed to `<CollapsibleRailGroup>`.
 */
const RESOURCE_GROUPS: ReadonlyArray<RailGroup> = [
  {
    caption: "Knowledge",
    landingHref: "/workspace/knowledge",
    groupKey: "knowledge",
    // The settled Knowledge shape: Research (the question engine over
    // collections, live as of Step 2) and Collections (admin-drawn scopes
    // over connected repositories, Step 1). The former Vault leaf dissolved
    // into Collections; Sources was superseded by the connector catalog +
    // governance.
    leaves: [
      {
        label: "Research",
        slug: "knowledge-research",
        href: "/workspace/knowledge/research",
      },
      {
        label: "Collections",
        slug: "knowledge-collections",
        href: "/workspace/knowledge/collections",
      },
    ],
  },
  {
    caption: "Workflows",
    landingHref: "/workspace/workflows",
    groupKey: "workflows",
    leaves: [
      {
        // The single Workflows leaf: the adaptive My Workflows screen, which
        // also carries the templates (the former Template Library is folded in
        // as its "Start from a template" section).
        label: "My Workflows",
        slug: "workflows",
        href: "/workspace/workflows/my-workflows",
      },
    ],
  },
  {
    caption: "Help",
    landingHref: "/workspace/help",
    groupKey: "help",
    leaves: [
      { label: "Guides", slug: "help", href: "/workspace/help/guides" },
      { label: "What’s New", slug: "help-whats-new" },
      { label: "About legalOS", slug: "help-about", href: "/", external: true },
    ],
  },
];

const lockedLink =
  "flex w-full items-center justify-between rounded-lg px-3 py-[7px] text-left text-[13.5px] font-[450] tracking-[-0.005em] text-muted-foreground transition-colors duration-release ease-release motion-reduce:transition-none hover:bg-hairline hover:duration-hover hover:ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export async function WorkspaceRail({
  departments,
  profile,
  agents,
  isAdmin,
  isPlatformOwner,
}: {
  departments: DepartmentWithAccess[];
  profile: ProfileShape;
  agents: AgentBreadcrumbContext[];
  isAdmin: boolean;
  isPlatformOwner: boolean;
}) {
  const displayName = getDisplayName(profile);
  const initials = getInitials(displayName);
  const roleLabel = ROLE_LABEL[profile.role];

  // Server-side fetch of the user's persisted rail group collapsed state.
  // Wrapped in `cache()` upstream so concurrent rail mounts in a single
  // request share one round-trip.
  const collapsedPrefResult =
    await getUserPreferenceAction<RailGroupsCollapsedValue>(
      railGroupsCollapsedKey,
    );
  const collapsedPrefs: RailGroupsCollapsedValue =
    collapsedPrefResult.ok &&
    collapsedPrefResult.value &&
    typeof collapsedPrefResult.value === "object"
      ? collapsedPrefResult.value
      : {};

  // Transform the `AgentBreadcrumbContext[]` array into a map shape so
  // both `WorkspaceNavLink` (per-leaf active resolution) and
  // `CollapsibleRailGroup` (per-group force-expand resolution) get O(1)
  // lookups when the user is on /workspace/agents/<id>. One conversion
  // at the rail boundary keeps every consumer downstream on one shape.
  const agentsLookup: AgentsLookup = Object.fromEntries(
    agents.map((a) => [a.id, a.department_slug]),
  );

  // Accessible department leaves used for force-expand-when-active
  // resolution. Locked rows are excluded — they're never the current
  // page (clicking opens a dialog, not a route). Computed once and
  // reused for the `leaves` prop on the Departments group.
  const departmentLeaves = departments
    .filter((d) => d.hasAccess)
    .map((d) => ({
      href: `/workspace/departments/${d.slug}`,
      match: "prefix" as const,
    }));

  return (
    <nav
      aria-label="Workspace"
      className="flex w-[232px] flex-col gap-[22px] overflow-auto border-r border-hairline bg-sidebar px-[14px] py-[22px]"
    >
      {/* Brand mark — clicking returns to /workspace landing. */}
      <Link
        href="/workspace"
        className="flex items-center gap-[10px] rounded-md px-2 pt-[2px] text-[15px] font-semibold tracking-[-0.015em] transition-colors duration-release ease-release motion-reduce:transition-none hover:bg-hairline hover:duration-hover hover:ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span
          aria-hidden
          className="h-[7px] w-[7px] rounded-full bg-primary"
        />
        {siteConfig.siteTitle}
      </Link>

      {/* Departments group (Session 29: locked-but-visible).
          Accessible departments render as full-weight WorkspaceNavLink
          rows with prefix-match active state (agent-aware via
          agentsLookup so /agents/<id> highlights the parent dept).
          Locked departments render as muted rows with a lock icon;
          clicking opens a department-scoped dialog. The group is
          hidden entirely only when the org has zero departments
          configured; a user with zero ACCESSIBLE departments still
          sees the group with all entries locked, matching the
          launchpad's visibility-with-permissions principle. */}
      {departments.length > 0 ? (
        <CollapsibleRailGroup
          caption="Departments"
          captionHref="/workspace/departments"
          groupKey="departments"
          defaultCollapsed={collapsedPrefs.departments ?? false}
          leaves={departmentLeaves}
          agentsLookup={agentsLookup}
        >
          {departments.map((d) => {
            if (d.hasAccess) {
              return (
                <WorkspaceNavLink
                  key={d.id}
                  href={`/workspace/departments/${d.slug}`}
                  match="prefix"
                  className={linkBase}
                  activeClassName={`${linkBase} ${linkActive}`}
                  agentsLookup={agentsLookup}
                >
                  {d.name}
                </WorkspaceNavLink>
              );
            }
            return (
              <LockedDepartmentRailRow
                key={d.id}
                departmentName={d.name}
                className={lockedLink}
              />
            );
          })}
        </CollapsibleRailGroup>
      ) : null}

      {/* Resource groups (Knowledge / Workflows / Help).
          Each renders a mono-caps caption + one or more leaves; each
          leaf links to its real route when `leaf.href` is set,
          otherwise falls back to a coming-soon page for that slug.
          External leaves (target="_blank") are excluded from the
          force-expand `leaves` prop — they can never be the current
          page. */}
      {RESOURCE_GROUPS.map((group) => {
        const activeSpecs = group.leaves
          .filter((leaf) => !leaf.external)
          .map((leaf) => ({
            href: leaf.href ?? `/workspace/coming-soon/${leaf.slug}`,
            match: "exact" as const,
          }));
        return (
          <CollapsibleRailGroup
            key={group.groupKey}
            caption={group.caption}
            captionHref={group.landingHref}
            groupKey={group.groupKey}
            defaultCollapsed={collapsedPrefs[group.groupKey] ?? false}
            leaves={activeSpecs}
          >
            {group.leaves.map((leaf) => {
              const href = leaf.href ?? `/workspace/coming-soon/${leaf.slug}`;
              if (leaf.external) {
                return (
                  <a
                    key={leaf.slug}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkBase}
                  >
                    {leaf.label}
                  </a>
                );
              }
              return (
                <WorkspaceNavLink
                  key={leaf.slug}
                  href={href}
                  match="exact"
                  className={linkBase}
                  activeClassName={`${linkBase} ${linkActive}`}
                >
                  {leaf.label}
                </WorkspaceNavLink>
              );
            })}
          </CollapsibleRailGroup>
        );
      })}

      <WorkspaceProfileBlock
        initials={initials}
        displayName={displayName}
        roleLabel={roleLabel}
        isAdmin={isAdmin}
        isPlatformOwner={isPlatformOwner}
      />
    </nav>
  );
}
