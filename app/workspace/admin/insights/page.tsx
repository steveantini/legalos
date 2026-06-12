import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { InsightsView } from "@/components/admin/insights/insights-view";
import { HelpLink } from "@/components/workspace/help-link";
import { isCurrentUserOrgAdmin, requireAuthUser } from "@/lib/auth/access";
import { getOrgInsights } from "@/lib/workspace/admin/insights/insights-math";

export const metadata: Metadata = {
  title: "Insights",
};

/**
 * Insights (MEASURE, A4a) — the measured usage/adoption lens. Shows how the
 * organization uses legalOS: total native-agent runs and how usage trends over a
 * chosen window, broken down by agent, department (via the agent), model, and
 * person, plus an adoption-gap signal (agents that exist but haven't been run).
 *
 * This is the usage half of Insights (Job C's "run the operation" view). The cost
 * and value/ROI half is deferred to A4b, because the meaning of recorded cost
 * depends on an unmade business-model decision (managed vs bring-your-own-model);
 * no cost is shown here. External-agent clicks aren't in usage_events, so the
 * activity shown is legalOS native-agent usage only — the subtitle says so.
 *
 * Gating: org-admin readable (reporting, not a security control). The data layer
 * already admits super/org admin via `usage_events_admin_read`; the page tightens
 * to `isCurrentUserOrgAdmin()` (mirror-RLS, like People).
 *
 * Data is fetched server-side and both the real and sample datasets live in the
 * client view, so the timeframe and sample toggles swap instantly with no fetch
 * — there is no client round-trip to skeleton (the home impact-band pattern). The
 * admin layout owns the 896px left-justified `<main>`; this renders a fragment
 * inside it in the established admin register.
 */
export default async function AdminInsightsPage() {
  await requireAuthUser();
  if (!(await isCurrentUserOrgAdmin())) {
    notFound();
  }

  const insights = await getOrgInsights();

  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
            Insights
          </h1>
          <p className="mt-[14px] max-w-[60ch] text-[14.5px] leading-[1.5] text-muted-foreground">
            How your organization is adopting and engaging with legalOS, measured
            from real activity: who is active, how usage is trending, and which
            agents are not being used yet. The value in dollars lives in the
            Productivity Calculator. The activity shown is native-agent usage inside
            legalOS.
          </p>
        </div>
        <HelpLink topic="insights" className="mt-3" />
      </header>

      <InsightsView real={insights} />
    </>
  );
}
