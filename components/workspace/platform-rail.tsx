import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import { PLATFORM_NAV_GROUPS } from "@/lib/platform/nav";
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
 * Platform-mode rail (C4L/platform arc, Step 1). Renders alongside the other
 * rails and is swapped in via `RailSwitcher` whenever the current pathname is
 * under `/workspace/platform`.
 *
 * Structure mirrors `AdminRail` exactly — same outer `<nav>` chrome, brand mark
 * as a link back to the workspace, `WorkspaceNavLink` primitive for active
 * state, and `WorkspaceProfileBlock` at the bottom — so the platform surface
 * feels native, one tier up. It differs only in the middle: a top-line
 * "Platform" link plus `PLATFORM_NAV_GROUPS` mapped to captioned groups.
 *
 * `PLATFORM_NAV_GROUPS` is empty in Step 1, so the rail shows only the top-line
 * link today; adding a platform area (the content library lands first, Step 3)
 * is a one-line edit to `lib/platform/nav.ts` and both this rail and the
 * platform landing pick it up automatically.
 */
export function PlatformRail({
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
      aria-label="Platform"
      className="flex w-[232px] flex-col gap-[22px] overflow-auto border-r border-hairline bg-sidebar px-[14px] py-[22px]"
    >
      {/* Brand mark — clicking exits platform mode and returns to /workspace. */}
      <Link
        href="/workspace"
        className="flex items-center gap-[10px] rounded-md px-2 pt-[2px] text-[15px] font-semibold tracking-[-0.015em] transition-colors duration-release ease-release motion-reduce:transition-none hover:bg-hairline hover:duration-hover hover:ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-primary" />
        <Wordmark />
      </Link>

      {/* Top-line Platform link — exact-match active on the landing only. */}
      <div className="flex flex-col gap-px">
        <WorkspaceNavLink
          href="/workspace/platform"
          match="exact"
          className={linkBase}
          activeClassName={`${linkBase} ${linkActive}`}
        >
          Platform
        </WorkspaceNavLink>
      </div>

      {/* Captioned platform groups from PLATFORM_NAV_GROUPS (empty in Step 1). */}
      {PLATFORM_NAV_GROUPS.map((group) => (
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
