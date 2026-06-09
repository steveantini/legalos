import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";

import {
  AdoptionFunnelsTile,
  AdoptionFunnelsTileSkeleton,
  CostByOrgTile,
  CostByOrgTileSkeleton,
  CostDailyTile,
  CostDailyTileSkeleton,
  CostSummaryTile,
  CostSummaryTileSkeleton,
  OrgHealthTile,
  OrgHealthTileSkeleton,
  UsagePulseTile,
  UsagePulseTileSkeleton,
  UsageSummaryTile,
  UsageSummaryTileSkeleton,
} from "@/components/platform/analytics/analytics-tiles";
import { captionLabel } from "@/lib/workspace/rail-styles";

export const metadata: Metadata = {
  title: "Analytics",
};

/**
 * Platform Analytics (analytics arc, Steps 1-2) — the cross-customer view on the
 * metric-layer framework. Gated by the platform layout's requirePlatformOwner():
 * a non-platform-owner, including an org super_admin, gets a 404.
 *
 * Each tile is an async server component reading a service-role-locked view
 * (migrations 0067-0068) through the server-only admin client, wrapped in its own
 * <Suspense> so the surface streams in tile by tile. There is no API route or
 * client data hook — the reads stay on the server with nothing to leak through
 * (DECISION_LOG D-140).
 *
 * The tiles are organised into three calm groups so the page stays scannable now
 * that it carries more: Engagement (the adoption/engagement-health table is the
 * centerpiece, alongside the totals and usage pulse), Cost (shown only at this
 * platform tier), and Adoption (the activation funnels). Group captions are h2;
 * the tiles render at h3 beneath them. The layout owns the 896px left-justified
 * <main>; this renders a fragment inside it.
 *
 * force-dynamic because analytics must always be live — the views read now() and
 * must never be served from a stale render.
 */
export const dynamic = "force-dynamic";

function Group({ caption, children }: { caption: string; children: ReactNode }) {
  const id = `analytics-${caption.toLowerCase()}`;
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className={`${captionLabel} mb-6`}>
        {caption}
      </h2>
      <div className="flex flex-col gap-12">{children}</div>
    </section>
  );
}

export default function PlatformAnalyticsPage() {
  return (
    <>
      <header>
        <h1 className="text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          Analytics
        </h1>
        <p className="mt-[14px] max-w-[60ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          How customers are adopting and engaging with legalOS, across the whole
          platform. The customer table shows activation, usage trend, and recent
          activity for each one, so a customer drifting quiet is easy to spot.
        </p>
      </header>

      <div className="mt-12 flex flex-col gap-16">
        <Group caption="Engagement">
          <Suspense fallback={<UsageSummaryTileSkeleton />}>
            <UsageSummaryTile />
          </Suspense>
          <Suspense fallback={<OrgHealthTileSkeleton />}>
            <OrgHealthTile />
          </Suspense>
          <Suspense fallback={<UsagePulseTileSkeleton />}>
            <UsagePulseTile />
          </Suspense>
        </Group>

        <Group caption="Cost">
          <Suspense fallback={<CostSummaryTileSkeleton />}>
            <CostSummaryTile />
          </Suspense>
          <Suspense fallback={<CostByOrgTileSkeleton />}>
            <CostByOrgTile />
          </Suspense>
          <Suspense fallback={<CostDailyTileSkeleton />}>
            <CostDailyTile />
          </Suspense>
        </Group>

        <Group caption="Adoption">
          <Suspense fallback={<AdoptionFunnelsTileSkeleton />}>
            <AdoptionFunnelsTile />
          </Suspense>
        </Group>
      </div>
    </>
  );
}
