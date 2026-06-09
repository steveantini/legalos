import type { Metadata } from "next";
import { Suspense } from "react";

import {
  OrgHealthTile,
  OrgHealthTileSkeleton,
  UsagePulseTile,
  UsagePulseTileSkeleton,
  UsageSummaryTile,
  UsageSummaryTileSkeleton,
} from "@/components/platform/analytics/analytics-tiles";

export const metadata: Metadata = {
  title: "Analytics",
};

/**
 * Platform Analytics (analytics arc, Step 1) — the cross-customer adoption and
 * engagement view, the first slice of the metric-layer framework.
 *
 * Gated by the platform layout's requirePlatformOwner(): a non-platform-owner,
 * including an org super_admin, gets a 404, never this page. Each tile is an
 * async server component that reads a service-role-locked view (migration 0067)
 * through the server-only admin client, wrapped here in its own <Suspense> so the
 * surface streams in tile by tile with per-tile skeletons (the impact-band
 * loading model, one tier up). There is no API route or client data hook — the
 * reads stay on the server with nothing to leak through (DECISION_LOG D-140).
 *
 * Order is context → detail → shape: the at-a-glance 30-day totals, then the
 * per-customer health table (the centerpiece, given the most room), then the
 * usage-pulse line. The layout owns the 896px left-justified <main>; this renders
 * a fragment inside it in the established platform register.
 *
 * force-dynamic because analytics must always be live — the views read now() and
 * must never be served from a stale render.
 */
export const dynamic = "force-dynamic";

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

      <div className="mt-12 flex flex-col gap-14">
        <Suspense fallback={<UsageSummaryTileSkeleton />}>
          <UsageSummaryTile />
        </Suspense>

        <Suspense fallback={<OrgHealthTileSkeleton />}>
          <OrgHealthTile />
        </Suspense>

        <Suspense fallback={<UsagePulseTileSkeleton />}>
          <UsagePulseTile />
        </Suspense>
      </div>
    </>
  );
}
