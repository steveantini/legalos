import type { Metadata, Viewport } from "next";

import { LandingArrival } from "@/components/landing/landing-arrival";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingTopbar } from "@/components/landing/landing-topbar";

/**
 * Marketing landing surface (Session 22 Step B). Replaces the
 * temporary one-line redirect introduced in Step A2. Moved from
 * app/page.tsx into the (marketing) route group (D-128) so the whole
 * public surface shares one segment; route groups don't affect URLs,
 * so this still serves `/`.
 *
 * Public-facing entry point — authenticated users see the same page;
 * the primary CTA routes everyone to /workspace and `proxy.ts` gates
 * the auth check from there. No auto-redirect on this surface.
 *
 * `dynamic = "force-dynamic"` so the topbar's "Weekday · Month Day"
 * label re-computes per request rather than freezing at build time.
 * The page is otherwise cheap (server-only string output) so the
 * dynamic mode has negligible cost.
 *
 * The stage is wrapped in `LandingArrival` (D-128): a cold document
 * load plays the full entrance choreography exactly as before; an
 * in-app return renders already settled behind one quick fade.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    absolute: "legalOS, the operating system for legal departments",
  },
  description:
    "One place for the agents, workflows, and tools your team uses every day, built around how legal work actually happens.",
};

export const viewport: Viewport = {
  themeColor: "#f4f1ec",
};

export default function RootLanding() {
  return (
    <LandingArrival>
      <LandingTopbar />
      <main>
        <LandingHero />
      </main>
      <LandingFooter />
    </LandingArrival>
  );
}
