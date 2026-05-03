import { redirect } from "next/navigation";

import { Toaster } from "@/components/ui/sonner";
import { WorkspaceRail } from "@/components/workspace/workspace-rail";
import { WorkspaceTopBar } from "@/components/workspace/workspace-top-bar";
import {
  getAccessibleDepartments,
  getCurrentUserProfile,
  requireAuthUser,
} from "@/lib/auth/access";

/**
 * Layout for the Aperture Workspace surface.
 *
 * Lives in its own route group `(workspace)` rather than `(app)` so the
 * workspace surface renders WITHOUT the global MainNav top bar — the
 * Aperture rail IS the navigation here. Other authenticated routes
 * still live under `(app)/` and continue to inherit MainNav + Toaster
 * via `(app)/layout.tsx`. Auth gating is handled globally by
 * `proxy.ts` (path is not in PUBLIC_PATHS).
 *
 * The chrome (outer two-column shell, rail, inner three-row grid, top
 * bar, body wrapper, footer) lives here so it persists across every
 * workspace-group route. Pages plug their content into the body
 * wrapper's `{children}` slot. Body padding (`px-14 pt-14 pb-8`) and
 * section gap (`gap-9`) match the Aperture spec's body rhythm
 * (`56px 56px 32px` / `36px gap`) and are workspace-wide.
 *
 * Data fetches: `requireAuthUser` (redirects to /login on absence),
 * `getCurrentUserProfile` (rail profile block + redirect to /login if
 * the proxy provisioning hasn't yet caught up), `getAccessibleDepartments`
 * (rail Departments group). All three are wrapped in React's `cache()`
 * so child pages calling the same helpers reuse the resolved value
 * within the same request — no duplicate Supabase queries.
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

  const departments = await getAccessibleDepartments(authUser.id);

  return (
    <div
      className="grid h-screen grid-cols-[232px_1fr] grid-rows-[100vh] overflow-hidden bg-background text-foreground"
      style={{ fontFeatureSettings: '"ss01", "cv11"' }}
    >
      <WorkspaceRail departments={departments} profile={profile} />
      <main className="grid min-h-0 grid-rows-[56px_1fr]">
        <WorkspaceTopBar departments={departments} />
        <div className="flex min-h-0 flex-col gap-9 overflow-auto px-14 pb-8 pt-14">
          {children}
        </div>
      </main>
      <Toaster />
    </div>
  );
}
