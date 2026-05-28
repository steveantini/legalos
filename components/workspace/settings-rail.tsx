import Link from "next/link";

import { siteConfig } from "@/config/site";
import { SETTINGS_NAV_ITEMS } from "@/lib/settings/nav";
import {
  ROLE_LABEL,
  getDisplayName,
  getInitials,
  type ProfileShape,
} from "@/lib/workspace/profile";
import { linkActive, linkBase } from "@/lib/workspace/rail-styles";

import { WorkspaceNavLink } from "./workspace-nav-link";
import { WorkspaceProfileBlock } from "./workspace-profile-block";

/**
 * Settings-mode rail (connector hub arc, Milestone 1). Swapped in via
 * `RailSwitcher` whenever the current pathname is under
 * `/workspace/settings`, the same mechanism that swaps in `AdminRail`
 * under `/workspace/admin`.
 *
 * Structure mirrors `AdminRail` and `WorkspaceRail` exactly — same outer
 * `<nav>` chrome, same brand-mark-as-link, same `WorkspaceNavLink`
 * primitive for active state, same `WorkspaceProfileBlock` at the bottom,
 * and the same shared tokens from `lib/workspace/rail-styles.ts`. Those
 * shared tokens are the drift-prevention discipline: the three rails
 * cannot diverge on link styling, captions, or active treatment because
 * they consume one source.
 *
 * Differs from `AdminRail` only in the middle: a flat list of
 * `SETTINGS_NAV_ITEMS` (no captioned groups, per the locked flat design)
 * rendered with `match="prefix"` so a nested route like
 * `/workspace/settings/connections/<anything>` keeps Connections active.
 *
 * Like `AdminRail`, takes only `profile` and `isAdmin` (the latter feeds
 * the profile block's conditional Admin item); no department- or
 * agent-aware active resolution is needed here.
 */
export function SettingsRail({
  profile,
  isAdmin,
}: {
  profile: ProfileShape;
  isAdmin: boolean;
}) {
  const displayName = getDisplayName(profile);
  const initials = getInitials(displayName);
  const roleLabel = ROLE_LABEL[profile.role];

  return (
    <nav
      aria-label="Settings"
      className="flex w-[232px] flex-col gap-[22px] overflow-auto border-r border-hairline bg-sidebar px-[14px] py-[22px]"
    >
      {/* Brand mark — clicking exits settings mode and returns to /workspace. */}
      <Link
        href="/workspace"
        className="flex items-center gap-[10px] rounded-md px-2 pt-[2px] text-[15px] font-semibold tracking-[-0.015em] transition-colors duration-release ease-release motion-reduce:transition-none hover:bg-hairline hover:duration-hover hover:ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-primary" />
        {siteConfig.siteTitle}
      </Link>

      {/* Flat settings nav — no captioned groups, per the locked design. */}
      <div className="flex flex-col gap-px">
        {SETTINGS_NAV_ITEMS.map((item) => (
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

      <WorkspaceProfileBlock
        initials={initials}
        displayName={displayName}
        roleLabel={roleLabel}
        isAdmin={isAdmin}
      />
    </nav>
  );
}
