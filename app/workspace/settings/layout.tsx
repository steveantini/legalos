/**
 * Settings mode shell — the third peer to the workspace and admin modes.
 *
 * Unlike `app/workspace/admin/layout.tsx`, there is no access gate: every
 * authenticated user has personal settings, so the whole area is
 * universally reachable. The rail swap (to `SettingsRail`) is handled
 * upstream by `RailSwitcher` in `app/workspace/layout.tsx` based on the
 * `/workspace/settings` pathname; this layout does not render a rail.
 *
 * It also does not impose a `<main>` / width wrapper the way the admin
 * layout does. Its children differ in shape: the landing page owns a
 * top-aligned `<main>` with its own width, while the coming-soon
 * sub-pages render `ComingSoonContent`, which is a full-height centered
 * `<main>` of its own. A layout-level `<main>` would nest those mains
 * (one landmark per page) and break the coming-soon centering, so each
 * settings page owns its main. This file is the mode boundary and the
 * home for any future shared settings chrome.
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
