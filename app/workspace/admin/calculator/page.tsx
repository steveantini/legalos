import { HybridCalculator } from "@/components/admin/calculator/hybrid-calculator";
import { HelpLink } from "@/components/workspace/help-link";
import { isCurrentUserSuperAdmin } from "@/lib/auth/access";
import { getOrgAgentsWithMeasuredRuns } from "@/lib/workspace/admin/calculator/measured";
import { getTaskBook } from "@/lib/workspace/admin/calculator/store";

/**
 * Productivity Calculator (hybrid, Step A). The admin layout gates the page to
 * admins; super admins can edit and save, other admins see it read-only.
 *
 * Server-fetches the org's persisted task book (the human-supplied assumptions),
 * the measured run volumes (live from usage_events, per agent), and whether the
 * caller may edit, then hands them to the client editor. Always live, so the
 * measured numbers reflect current usage.
 */
export const dynamic = "force-dynamic";

export default async function AdminCalculatorPage() {
  const [config, agents, canEdit] = await Promise.all([
    getTaskBook(),
    getOrgAgentsWithMeasuredRuns(),
    isCurrentUserSuperAdmin(),
  ]);

  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold">Productivity Calculator</h1>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            Estimate the time and cost your agents save. How often each task runs is
            measured from your real usage; salary and the time saved per run are your
            estimates, so every number is marked measured or estimate.
          </p>
        </div>
        <HelpLink topic="insights" className="mt-1" />
      </header>

      <HybridCalculator initialConfig={config} agents={agents} canEdit={canEdit} />
    </>
  );
}
