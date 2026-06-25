import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import { ADMIN_NAV_GROUPS } from "@/lib/admin/nav";
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
 * Admin-mode rail (Session 30). Renders alongside `WorkspaceRail` and is
 * swapped in via `RailSwitcher` whenever the current pathname is under
 * `/workspace/admin`.
 *
 * Structure mirrors `WorkspaceRail` exactly — same outer `<nav>` chrome,
 * same brand-mark-as-link, same `WorkspaceNavLink` primitive for active
 * state, same `WorkspaceProfileBlock` at the bottom. The admin rail
 * differs only in the middle: a single top-line "Admin" link plus
 * `ADMIN_NAV_GROUPS` mapped to captioned groups. As of the Admin polish
 * arc (D-074) the captions are admin's two jobs — GOVERN (People, Policy
 * & access) and MEASURE (Insights, Evals) — so the rail itself teaches
 * the mental model. Adding or moving an area is a one-line edit to
 * `lib/admin/nav.ts`; both this rail and the admin landing pick it up
 * automatically.
 *
 * Does NOT receive `departments` or `agents` props — admin nav has no
 * department- or agent-aware active resolution. The breadcrumb still
 * handles those for routes that need them; the rail itself doesn't.
 */
export function AdminRail({
  profile,
  isAdmin,
  isPlatformOwner,
}: {
  profile: ProfileShape;
  isAdmin: boolean;
  isPlatformOwner: boolean;
}) {
  const displayName = getDisplayName(profile);
  const initials = getInitials(displayName);
  const roleLabel = ROLE_LABEL[profile.role];

  return (
    <nav
      aria-label="Admin"
      className="flex w-[232px] flex-col gap-[22px] overflow-auto border-r border-hairline bg-sidebar px-[14px] py-[22px]"
    >
      {/* Brand mark — clicking exits admin mode and returns to /workspace. */}
      <Link
        href="/workspace"
        className="flex items-center gap-[10px] rounded-md px-2 pt-[2px] text-[15px] font-semibold tracking-[-0.015em] transition-colors duration-release ease-release motion-reduce:transition-none hover:bg-hairline hover:duration-hover hover:ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span
          aria-hidden
          className="h-[7px] w-[7px] rounded-full bg-primary"
        />
        <Wordmark />
      </Link>

      {/* Top-line Admin link — exact-match active on the landing only. */}
      <div className="flex flex-col gap-px">
        <WorkspaceNavLink
          href="/workspace/admin"
          match="exact"
          className={linkBase}
          activeClassName={`${linkBase} ${linkActive}`}
        >
          Admin
        </WorkspaceNavLink>
      </div>

      {/* Captioned admin groups from ADMIN_NAV_GROUPS. */}
      {ADMIN_NAV_GROUPS.map((group) => (
        <div key={group.caption} className="flex flex-col gap-px">
          <p className={`${captionLabel} mx-2 mb-2`}>{group.caption}</p>
          {group.items.map((item) => (
            <WorkspaceNavLink
              key={item.href}
              href={item.href}
              match="prefix"
              className={linkBase}
              activeClassName={`${linkBase} ${linkActive}`}
            >
              {item.label}
            </WorkspaceNavLink>
          ))}
        </div>
      ))}

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
