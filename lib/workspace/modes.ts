/**
 * The product's top-level modes (workspace areas), defined once (D-077).
 *
 * Both the rail-switcher (`components/workspace/rail-switcher.tsx`) and the
 * profile menu (`components/workspace/workspace-profile-block.tsx`) derive "what
 * mode am I in" from this single source, so the two cannot drift on the mode
 * list or the current-mode precedence. Adding a future mode is one entry here,
 * consumed by both.
 *
 * Precedence matters: `/workspace` is a prefix of every mode's route, so the
 * more specific modes (admin, settings) must be tested before Workspace, which
 * is the default. `MODES` is ordered for display; `getCurrentMode` enforces the
 * precedence independently of that order.
 *
 * Pure (no React) so the client profile menu and the client rail-switcher can
 * both import it.
 */

export type ModeKey = "workspace" | "settings" | "admin" | "platform";

export type Mode = {
  key: ModeKey;
  /** Display label and menu/destination text. */
  label: string;
  /** The mode's landing route. */
  href: string;
  /** True only for modes visible to admins (gate on the isAdmin check). */
  adminGated: boolean;
  /**
   * True only for the cross-tenant PLATFORM mode (gate on the platform-owner
   * check). A separate axis from `adminGated`: a platform owner sees Platform
   * whether or not they are an org admin, and a mere org admin never does.
   */
  platformGated?: boolean;
};

/** Modes in display order (Workspace, Settings, Admin, Platform). */
export const MODES: ReadonlyArray<Mode> = [
  {
    key: "workspace",
    label: "Workspace",
    href: "/workspace",
    adminGated: false,
  },
  {
    key: "settings",
    label: "Settings",
    href: "/workspace/settings",
    adminGated: false,
  },
  {
    key: "admin",
    label: "Admin",
    href: "/workspace/admin",
    adminGated: true,
  },
  {
    key: "platform",
    label: "Platform",
    href: "/workspace/platform",
    // Not adminGated: a platform owner who is not an org admin still sees it.
    adminGated: false,
    platformGated: true,
  },
];

/**
 * The current mode for a pathname, respecting precedence: admin, then settings,
 * then Workspace as the default (since `/workspace` prefixes every mode's
 * route). The single source of truth for current-mode determination across the
 * rail-switcher and the profile menu.
 */
export function getCurrentMode(pathname: string): ModeKey {
  if (pathname.startsWith("/workspace/platform")) return "platform";
  if (pathname.startsWith("/workspace/admin")) return "admin";
  if (pathname.startsWith("/workspace/settings")) return "settings";
  return "workspace";
}
