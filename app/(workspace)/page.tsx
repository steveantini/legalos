import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DepartmentGrid } from "@/components/workspace/department-grid";
import { WorkspaceHero } from "@/components/workspace/workspace-hero";
import { siteConfig } from "@/config/site";
import {
  getAccessibleDepartments,
  getAgentCountsByDepartment,
  getCurrentUserProfile,
  requireAuthUser,
} from "@/lib/auth/access";

/**
 * Aperture Workspace landing — content only. The chrome (rail + top bar
 * + footer + outer grid shell) lives in `app/(workspace)/layout.tsx` so
 * it persists across navigation as more workspace routes land.
 *
 * Three reads compose this page; `requireAuthUser`,
 * `getCurrentUserProfile`, and `getAccessibleDepartments` are all
 * wrapped in React's `cache()` (see `lib/auth/access.ts`), so the
 * layout's earlier calls to the same helpers + this page's calls
 * resolve to a single Supabase round-trip per helper, per request.
 * `getAgentCountsByDepartment` is page-only (the chrome doesn't need
 * counts) and not memoized today since there's only one caller.
 *
 * Per the phantom-data scope rules: hero stats are hidden in the
 * `<WorkspaceHero>` component, and the bolded-phrase mechanic stays
 * in the hero parser but is a no-op for plain greetings. The empty-
 * departments branch (defensive — every seeded user has all 8) shows
 * a contact-admin subline instead of the dynamic counts.
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
    // Layout already redirects on null profile, but TypeScript needs
    // the narrowing here for the firstName derivation below. The
    // `cache()` wrap means this is a no-op fetch repeating the layout's
    // result.
    redirect("/login");
  }

  const [departments, agentCounts] = await Promise.all([
    getAccessibleDepartments(authUser.id),
    getAgentCountsByDepartment(),
  ]);

  const firstName = getFirstName(profile);
  // Wrap the first name in **...** so WorkspaceHero's emphasis parser
  // renders it as slate-blue + weight-500 per the Aperture spec's
  // bold-highlighted-phrase pattern. The page-level decision (vs.
  // hardcoding inside the hero) keeps the parser content-driven —
  // future copy can highlight any phrase, not just the username.
  const greeting = `${getGreetingPrefix()}, **${firstName}**.`;
  const totalAgents = Object.values(agentCounts).reduce((s, n) => s + n, 0);
  const deptCount = departments.length;

  // Empty-departments branch (stranger auto-provisioned by ensure_user_-
  // provisioned with no department roles, or a real org member who's
  // had their roles revoked). Two-line subline: a sentence acknowledging
  // the state, plus a mailto CTA pointing at siteConfig.adminEmail so
  // the user has an explicit affordance to request access — closing the
  // gap surfaced in Session 20 Step B recon. Populated case is unchanged.
  const requestAccessHref =
    `mailto:${siteConfig.adminEmail}` +
    `?subject=${encodeURIComponent("Request access to legalOS")}` +
    `&body=${encodeURIComponent(
      "Hi, I'd like to request access to a department in legalOS.",
    )}`;
  const subline =
    deptCount === 0 ? (
      <>
        You don&apos;t have access to any departments yet.
        <br />
        <a
          href={requestAccessHref}
          className="text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Request access from your admin.
        </a>
      </>
    ) : (
      `${totalAgents} ${totalAgents === 1 ? "agent is" : "agents are"} working across ${deptCount} ${deptCount === 1 ? "department" : "departments"}. Pick a department to pivot in.`
    );

  return (
    <>
      <WorkspaceHero greeting={greeting} subline={subline} />
      {deptCount > 0 ? (
        <DepartmentGrid departments={departments} agentCounts={agentCounts} />
      ) : null}
    </>
  );
}
