import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DepartmentGrid } from "@/components/workspace/department-grid";
import { WorkspaceHero } from "@/components/workspace/workspace-hero";
import { WorkspaceModules } from "@/components/workspace/workspace-modules";
import { siteConfig } from "@/config/site";
import {
  getAccessibleDepartments,
  getAgentCountsByDepartment,
  getCurrentUserProfile,
  isCurrentUserOrgAdmin,
  requireAuthUser,
} from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Phase 2 demo placeholder for future RBAC. Departments whose slug
 * appears here render in `<DepartmentCard>`'s locked variant — visible
 * in the grid as non-clickable, muted cards with a "Request access"
 * mailto. The constant goes away when real per-user department-role
 * gating arrives via `user_department_roles` and the rendered grid is
 * filtered server-side based on `getAccessibleDepartments(userId)`
 * actually returning fewer rows for non-admin users. Until then this
 * is the demo surface for the open-signup posture documented in
 * D-035 — every authenticated user sees all 8 departments today, so
 * we use the locked treatment to communicate "this department exists
 * but isn't yours" without breaking the grid layout.
 */
const LOCKED_DEPARTMENT_SLUGS = ["product", "compliance"] as const;

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
 * place."), but is overridden in the empty-departments branch by
 * the Session 20 mailto-request-access CTA — applies equally to both
 * variants since "no department access" is independent of welcome
 * state.
 *
 * Reads composed by this page: `requireAuthUser`, `getCurrentUserProfile`,
 * `getAccessibleDepartments` (all wrapped in React's `cache()` per
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
    getAccessibleDepartments(authUser.id),
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

  // Empty-departments branch — overrides both variants' default
  // subline with a focused mailto CTA pointing at siteConfig.adminEmail.
  // Stranger auto-provisioned via ensure_user_provisioned with no
  // department roles, OR a real org member who's had their roles
  // revoked. Same treatment regardless of welcome state.
  const requestAccessHref =
    `mailto:${siteConfig.adminEmail}` +
    `?subject=${encodeURIComponent("Request access to legalOS")}` +
    `&body=${encodeURIComponent(
      "Hi, I'd like to request access to a department in legalOS.",
    )}`;
  const sublineOverride =
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
    ) : undefined;

  return (
    <main className="flex flex-col gap-9">
      <WorkspaceHero variant={variant} subline={sublineOverride} />
      {deptCount > 0 ? (
        <>
          <DepartmentGrid
            departments={departments}
            agentCounts={agentCounts}
            lockedSlugs={LOCKED_DEPARTMENT_SLUGS}
            canEdit={isOrgAdmin}
          />
          {/* Secondary modules — only rendered for users with department
              access. The empty-departments branch keeps its focused
              request-access state; adding "More in legalOS" below it
              would compete with the mailto CTA for attention. */}
          <WorkspaceModules />
        </>
      ) : null}
    </main>
  );
}
