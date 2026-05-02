/**
 * Layout for the Aperture Workspace landing (Session 9e).
 *
 * Lives in its own route group `(workspace)` rather than `(app)` so the
 * workspace landing renders WITHOUT the global MainNav top bar. The
 * Aperture design has its own left-rail nav (`<WorkspaceRail />`); the
 * MainNav top bar would clash visually and break the 1440×900 layout.
 *
 * Other authenticated routes still live under `(app)/` and continue to
 * inherit MainNav + Toaster via `(app)/layout.tsx`. Auth gating is
 * handled globally by `proxy.ts` (path is not in PUBLIC_PATHS), so no
 * per-route auth check is needed in this layout.
 */
export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
