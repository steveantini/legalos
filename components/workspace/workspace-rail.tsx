import { siteConfig } from "@/config/site";
import type {
  AccessibleDepartment,
  AgentBreadcrumbContext,
} from "@/lib/auth/access";

import { WorkspaceNavLink } from "./workspace-nav-link";
import { WorkspaceProfileBlock } from "./workspace-profile-block";

type ProfileShape = {
  full_name: string | null;
  email: string;
  role: "super_admin" | "org_admin" | "user";
};

const RESOURCE_LINKS: ReadonlyArray<{ slug: string; label: string }> = [
  { slug: "knowledge", label: "Knowledge" },
  { slug: "matters", label: "Matters / Deals" },
  { slug: "inbox", label: "Inbox" },
  { slug: "resources", label: "Resources" },
];

const ROLE_LABEL: Record<ProfileShape["role"], string> = {
  super_admin: "Super admin",
  org_admin: "Org admin",
  user: "User",
};

function getDisplayName(profile: ProfileShape): string {
  const trimmed = profile.full_name?.trim();
  if (trimmed) return trimmed;
  const local = profile.email.split("@")[0] ?? "";
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : profile.email;
}

function getInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length >= 2) {
    const first = parts[0]?.[0] ?? "";
    const last = parts[parts.length - 1]?.[0] ?? "";
    return `${first}${last}`.toUpperCase();
  }
  return (parts[0] ?? "").slice(0, 2).toUpperCase();
}

const linkBase =
  "flex items-center justify-between rounded-lg px-3 py-[7px] text-[13.5px] font-[450] tracking-[-0.005em] text-ink-2 transition-colors duration-150 hover:bg-hairline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const linkActive =
  "bg-sidebar-primary text-sidebar-primary-foreground font-medium hover:bg-sidebar-primary";

const captionLabel =
  "mx-2 mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-caption";

export function WorkspaceRail({
  departments,
  profile,
  agents,
  isAdmin,
}: {
  departments: AccessibleDepartment[];
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
      {/* Brand mark */}
      <div className="flex items-center gap-[10px] px-2 pt-[2px] text-[15px] font-semibold tracking-[-0.015em]">
        <span
          aria-hidden
          className="h-[7px] w-[7px] rounded-full bg-primary"
        />
        {siteConfig.siteTitle}
      </div>

      {/* Group 1 — Workspace */}
      <div className="flex flex-col gap-px">
        <WorkspaceNavLink
          href="/"
          match="exact"
          className={linkBase}
          activeClassName={`${linkBase} ${linkActive}`}
        >
          Workspace
        </WorkspaceNavLink>
      </div>

      {/* Group 2 — Departments (prefix-match active state, plus
          agent-aware: navigating to /agents/<id> keeps the agent's
          parent department highlighted via agentsLookup). */}
      <div className="flex flex-col gap-px">
        <p className={captionLabel}>Departments</p>
        {departments.map((d) => (
          <WorkspaceNavLink
            key={d.id}
            href={`/departments/${d.slug}`}
            match="prefix"
            className={linkBase}
            activeClassName={`${linkBase} ${linkActive}`}
            agentsLookup={agents}
          >
            {d.name}
          </WorkspaceNavLink>
        ))}
      </div>

      {/* Group 3 — Resource links (no group label per spec) */}
      <div className="flex flex-col gap-px">
        {RESOURCE_LINKS.map(({ slug, label }) => (
          <WorkspaceNavLink
            key={slug}
            href={`/coming-soon/${slug}`}
            match="exact"
            className={linkBase}
            activeClassName={`${linkBase} ${linkActive}`}
          >
            {label}
          </WorkspaceNavLink>
        ))}
      </div>

      <WorkspaceProfileBlock
        initials={initials}
        displayName={displayName}
        roleLabel={roleLabel}
        isAdmin={isAdmin}
      />
    </nav>
  );
}
