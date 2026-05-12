import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DepartmentGrid } from "@/components/workspace/department-grid";
import { WorkspaceHero } from "@/components/workspace/workspace-hero";
import { WorkspaceModules } from "@/components/workspace/workspace-modules";
import { siteConfig } from "@/config/site";
import {
  getAgentCountsByDepartment,
  getAllDepartmentsWithAccess,
  getCurrentUserProfile,
  isCurrentUserOrgAdmin,
  requireAuthUser,
} from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Aperture Workspace landing — content only. The chrome (rail + top bar
 * + footer + outer grid shell) lives in `app/(workspace)/layout.tsx` so
 * it persists across navigation as more workspace routes land.
 *
 * Hero variant decision (Session 21 — simplified):
 *
 *   - `welcomed_at IS NULL`     → variant="welcome". Page also writes
 *     `welcomed_at = now()` so the next request falls through to the
 *     returning variant.
 *   - `welcomed_at IS NOT NULL` → variant="returning". Same lead /
 *     subline shape as welcome but drops the "Welcome to" prefix.
 *
 * The subline is identical default copy for both variants ("Your
 * team's agents, knowledge, matters, and resources, all in one
 * place."), but is overridden in the no-access branch by the
 * mailto-request-access CTA. The override now triggers on
 * `accessibleCount === 0` (Session 29) rather than `deptCount === 0`
 * since the grid surfaces every department in the org with a locked
 * variant for the ones the user can't enter — having zero access and
 * having zero departments configured are distinct states. A user with
 * zero access sees both the request-access subline AND the locked
 * grid below it (visibility-with-permissions); an org with literally
 * zero departments configured falls through to no grid at all.
 *
 * Reads composed by this page: `requireAuthUser`, `getCurrentUserProfile`,
 * `getAllDepartmentsWithAccess` (all wrapped in React's `cache()` per
 * `lib/auth/access.ts` — the layout's earlier calls and this page's
 * calls dedup to a single round-trip per helper, per request).
 * `getAgentCountsByDepartment` is page-only (the chrome doesn't need
 * counts) and not memoized today since there's only one caller.
 */

export const metadata: Metadata = {
  title: "Workspace",
};

export default async function WorkspacePage() {
  const authUser = await requireAuthUser();
  const profile = await getCurrentUserProfile();

  if (!profile) {
    // Layout already redirects on null profile, but TypeScript needs
    // narrowing. The cache() wrap means this is a no-op fetch repeating
    // the layout's result.
    redirect("/login");
  }

  const [departments, agentCounts, isOrgAdmin] = await Promise.all([
    getAllDepartmentsWithAccess(authUser.id),
    getAgentCountsByDepartment(),
    isCurrentUserOrgAdmin(),
  ]);

  const isFirstLogin = profile.welcomed_at == null;
  const variant: "welcome" | "returning" = isFirstLogin
    ? "welcome"
    : "returning";

  // First-login path: write welcomed_at before render returns. We DON'T
  // use a fire-and-forget here because Next.js Server Components run
  // in a request-bounded context — backgrounded promises after the
  // response stream finishes can be terminated by the platform. An
  // awaited UPDATE ensures the mutation lands before the request ends,
  // at the cost of one Supabase round-trip on the first authenticated
  // load (one-time per account lifetime). Failures are logged and
  // swallowed: the user sees the welcome again on next request, which
  // is preferable to a render error on first visit.
  if (isFirstLogin) {
    try {
      const supabase = await createSupabaseServerClient();
      await supabase
        .from("users")
        .update({ welcomed_at: new Date().toISOString() })
        .eq("id", authUser.id);
    } catch (err) {
      console.error("welcomed_at update failed", err);
    }
  }

  const deptCount = departments.length;
  const accessibleCount = departments.filter((d) => d.hasAccess).length;

  // No-access branch — overrides both hero variants' default subline
  // with a focused mailto CTA pointing at siteConfig.adminEmail. Same
  // treatment whether the user is freshly auto-provisioned via
  // ensure_user_provisioned with no defaults, or a real org member
  // whose grants were revoked. The grid below still renders (with
  // every department locked) so the user can see what exists.
  const requestAccessHref =
    `mailto:${siteConfig.adminEmail}` +
    `?subject=${encodeURIComponent("Request access to legalOS")}` +
    `&body=${encodeURIComponent(
      "Hi, I'd like to request access to a department in legalOS.",
    )}`;
  const sublineOverride =
    accessibleCount === 0 ? (
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
    ) : undefined;

  return (
    <main className="flex flex-col gap-9">
      <WorkspaceHero variant={variant} subline={sublineOverride} />
      {deptCount > 0 ? (
        <>
          <DepartmentGrid
            departments={departments}
            agentCounts={agentCounts}
            canEdit={isOrgAdmin}
          />
          {/* Secondary modules — only rendered for users who have
              access to at least one department. A user with zero
              access keeps the focused request-access subline above
              and the all-locked grid below; "More in legalOS" would
              compete with the mailto CTA for attention. */}
          {accessibleCount > 0 ? <WorkspaceModules /> : null}
        </>
      ) : null}
    </main>
  );
}
