import { redirect } from "next/navigation";

import { Toaster } from "@/components/ui/sonner";
import { WorkspaceRail } from "@/components/workspace/workspace-rail";
import { WorkspaceTopBar } from "@/components/workspace/workspace-top-bar";
import {
  getAccessibleAgentsForBreadcrumb,
  getAccessibleDepartments,
  getCurrentUserProfile,
  isCurrentUserAdmin,
  requireAuthUser,
} from "@/lib/auth/access";

/**
 * Layout for the Aperture Workspace surface — the only layout for
 * authenticated routes after Session 14 retired the legacy
 * `(app)/layout.tsx` + `MainNav` chrome. Auth gating is handled
 * globally by `proxy.ts` (path is not in PUBLIC_PATHS); this layout
 * adds `requireAuthUser()` as defense-in-depth and serves the actual
 * workspace chrome (rail, top bar, body wrapper).
 *
 * The chrome (outer two-column shell, rail, inner two-row grid, top
 * bar, body wrapper, Toaster sink) lives here so it persists across
 * every workspace-group route. Pages plug their content into the body
 * wrapper's `{children}` slot. Body padding (`px-14 pt-14 pb-8`) and
 * section gap (`gap-9`) match the Aperture spec's body rhythm
 * (`56px 56px 32px` / `36px gap`) and are workspace-wide.
 *
 * Data fetches: `requireAuthUser` (redirects to /login on absence),
 * `getCurrentUserProfile` (rail profile block + redirect to /login if
 * the proxy provisioning hasn't yet caught up), `getAccessibleDepartments`
 * (rail Departments group + breadcrumb dept-name lookup),
 * `getAccessibleAgentsForBreadcrumb` (breadcrumb + rail agent-aware
 * active state), `isCurrentUserAdmin` (rail profile dropdown's
 * conditional Admin item). All five are wrapped in React's `cache()`
 * so the layout's calls and any child page calls within the same
 * request resolve to a single Supabase round-trip per helper.
 */
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authUser = await requireAuthUser();
  const profile = await getCurrentUserProfile();

  if (!profile) {
    // Defensive: proxy provisioning may have raced. Send to login so
    // the next sign-in re-runs ensure_user_provisioned.
    redirect("/login");
  }

  const [departments, agents, isAdmin] = await Promise.all([
    getAccessibleDepartments(authUser.id),
    getAccessibleAgentsForBreadcrumb(authUser.id),
    isCurrentUserAdmin(),
  ]);

  return (
    <div
      className="grid h-screen grid-cols-[232px_1fr] grid-rows-[100vh] overflow-hidden bg-background text-foreground"
      style={{ fontFeatureSettings: '"ss01", "cv11"' }}
    >
      <WorkspaceRail
        departments={departments}
        profile={profile}
        agents={agents}
        isAdmin={isAdmin}
      />
      <main className="grid min-h-0 grid-rows-[56px_1fr]">
        <WorkspaceTopBar departments={departments} agents={agents} />
        <div className="flex min-h-0 flex-col gap-9 overflow-auto px-14 pb-8 pt-14">
          {children}
        </div>
      </main>
      <Toaster />
    </div>
  );
}
