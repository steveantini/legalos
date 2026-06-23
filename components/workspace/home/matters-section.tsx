import {
  getMatters,
  getMattersSummary,
  isMattersConnected,
  type MattersScope,
  type ScopedMatters,
} from "@/lib/workspace/home/matters-connection";

import { MattersConnected } from "./matters-connected";

type MattersSectionProps = {
  userId: string;
};

const SCOPES: MattersScope[] = ["mine", "team", "all"];

/**
 * The workspace home "Matters" section, between the Today | Impact row and
 * Tools. Branches on the CLM connection gate, the same honest-state pattern as
 * the Today card:
 *
 * - Not connected (always, for now): an honest "available soon" state. No
 *   matter-management provider has a connection adapter yet, so there is
 *   nothing to connect to; the card previews the value as coming rather than
 *   offering a Connect button that leads nowhere.
 * - Connected (never yet, but built): the rich Matters view (MattersConnected).
 *
 * `isMattersConnected` returns false until CLM / matter-management integration
 * ships (Share and connector hub arc, roadmap item 2), so the available-soon
 * state is the only one any user sees today; the rich view is built and dormant.
 *
 * Async server component with an instant gate check — no Suspense today; a
 * boundary gets added alongside the real CLM fetch.
 */
export async function MattersSection({ userId }: MattersSectionProps) {
  const connected = await isMattersConnected(userId);
  const scopedData = connected ? await loadScopedData(userId) : null;

  return (
    <section
      aria-labelledby="matters-section-heading"
      className="flex flex-col gap-3.5"
    >
      {scopedData ? (
        // CLM display name comes from the connection metadata when the
        // integration ships; placeholder token for the dormant view.
        <MattersConnected scopedData={scopedData} clmName="your CLM" />
      ) : (
        <>
          <div className="flex h-9 items-center">
            <h2
              id="matters-section-heading"
              className="text-[18px] font-medium tracking-[-0.005em] text-foreground"
            >
              Matters
            </h2>
          </div>

          <div className="flex flex-col rounded-xl border border-border bg-card p-5">
            <p className="mb-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-caption">
              Matters · available soon
            </p>
            <p className="mb-1.5 text-[17px] font-medium text-foreground">
              Your matters, in flight
            </p>
            <p className="max-w-[64ch] text-[13px] leading-[1.45] text-muted-foreground">
              Soon your active matters and deals will sync from your CLM or
              matter management tool, with status, deadlines, and value in
              flight. legalOS reads your system of record, never writes to it.
            </p>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Pre-fetch every scope so the client toggle swaps instantly with no further
 * round-trip (mirrors the impact band pre-fetching all timeframes). Returns
 * empty/null payloads today since no provider is connected.
 */
async function loadScopedData(
  userId: string,
): Promise<Record<MattersScope, ScopedMatters>> {
  const entries = await Promise.all(
    SCOPES.map(async (scope) => {
      const [summary, matters] = await Promise.all([
        getMattersSummary(userId, scope),
        getMatters(userId, scope),
      ]);
      return [scope, { summary, matters }] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<MattersScope, ScopedMatters>;
}
