import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DepartmentGrid } from "@/components/workspace/department-grid";
import { WorkspaceFooter } from "@/components/workspace/workspace-footer";
import { WorkspaceHero } from "@/components/workspace/workspace-hero";
import { WorkspaceRail } from "@/components/workspace/workspace-rail";
import { WorkspaceTopBar } from "@/components/workspace/workspace-top-bar";
import {
  getAccessibleDepartments,
  getAgentCountsByDepartment,
  getCurrentUserProfile,
  requireAuthUser,
} from "@/lib/auth/access";

/**
 * Aperture Workspace landing (Session 9e). Replaces the prior
 * department picker that lived at `app/(app)/page.tsx`. Three reads
 * compose the page: the auth user (gated), the public.users profile
 * (greeting + rail profile block), and accessible departments + agent
 * counts (rail + grid).
 *
 * Per the phantom-data scope rules: hero stats are hidden, the live-
 * agents pulse in the top bar is hidden, and the per-department counts
 * in the rail are hidden. Cards show real `{N} agents` from the DB.
 *
 * The subline is a literal placeholder per the session 9e plan ("Eight
 * agents are working across eight departments. ..."). Real data may
 * make these numbers inaccurate (Commercial alone has more than one
 * agent today); the copy is acknowledged-static and a future content
 * pass can swap to dynamic numbers when we want them. The empty-
 * departments branch (defensive — every seeded user has all 8) shows
 * a contact-admin message instead.
 */

export const metadata: Metadata = {
  title: "Workspace",
};

function getGreetingPrefix(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getFirstName(profile: {
  full_name: string | null;
  email: string;
}): string {
  const trimmed = profile.full_name?.trim();
  if (trimmed) {
    const first = trimmed.split(/\s+/)[0];
    if (first) return first;
  }
  const local = profile.email.split("@")[0] ?? "";
  return local
    ? local.charAt(0).toUpperCase() + local.slice(1)
    : profile.email;
}

export default async function WorkspacePage() {
  const authUser = await requireAuthUser();
  const profile = await getCurrentUserProfile();

  if (!profile) {
    // Defensive: proxy provisioning may have raced. Send to login so the
    // next sign-in re-runs ensure_user_provisioned.
    redirect("/login");
  }

  const [departments, agentCounts] = await Promise.all([
    getAccessibleDepartments(authUser.id),
    getAgentCountsByDepartment(),
  ]);

  const firstName = getFirstName(profile);
  const greeting = `${getGreetingPrefix()}, ${firstName}.`;
  const totalAgents = Object.values(agentCounts).reduce((s, n) => s + n, 0);
  const deptCount = departments.length;
  const subline =
    deptCount === 0
      ? "You don't have access to any departments yet. Contact your admin to request access."
      : `${totalAgents} ${totalAgents === 1 ? "agent is" : "agents are"} working across ${deptCount} ${deptCount === 1 ? "department" : "departments"}. Pick a department to pivot in.`;

  return (
    <div
      className="grid h-screen grid-cols-[232px_1fr] overflow-hidden bg-background text-foreground"
      style={{ fontFeatureSettings: '"ss01", "cv11"' }}
    >
      <WorkspaceRail departments={departments} profile={profile} />
      <main className="grid min-h-0 grid-rows-[56px_1fr_36px]">
        <WorkspaceTopBar />
        <div className="flex min-h-0 flex-col gap-9 overflow-auto px-14 pb-8 pt-14">
          <WorkspaceHero greeting={greeting} subline={subline} />
          <DepartmentGrid
            departments={departments}
            agentCounts={agentCounts}
          />
        </div>
        <WorkspaceFooter />
      </main>
    </div>
  );
}
