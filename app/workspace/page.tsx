import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { CalendarConnectCard } from "@/components/workspace/home/calendar-connect-card";
import { HomeGreeting } from "@/components/workspace/home/home-greeting";
import { ImpactBand } from "@/components/workspace/home/impact-band";
import { IntegrationsRow } from "@/components/workspace/home/integrations-row";
import { MattersSection } from "@/components/workspace/home/matters-section";
import { ReadingSection } from "@/components/workspace/home/reading-section";
import {
  getAllDepartmentsWithAccess,
  getCurrentUserProfile,
  isCurrentUserAdmin,
  requireAuthUser,
} from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Aperture Workspace home — a personalized landing. The chrome (rail,
 * top bar, body wrapper) lives in `app/workspace/layout.tsx`; this page
 * supplies the body content.
 *
 * Structure: a personal greeting (`HomeGreeting`), then, for users with
 * at least one accessible department, a calendar Connect card
 * (`CalendarConnectCard`), a usage impact band (`ImpactBand`), an
 * integrations row (`IntegrationsRow`), and a "Desk" empty-state section
 * (`ReadingSection`). Only the impact band fetches independently behind a
 * Suspense boundary; the greeting, calendar card, integrations row, and
 * reading section are static and paint immediately.
 *
 * Recently-used agents and the full department directory used to live
 * here too; the Stage 1 home revamp removed them so every element on the
 * home earns its place. They remain reachable at `/workspace/agents` and
 * `/workspace/departments`.
 *
 * Reads composed here: `requireAuthUser`, `getCurrentUserProfile`,
 * `getAllDepartmentsWithAccess` (all `cache()`-wrapped per
 * `lib/auth/access.ts`, deduped with the layout's calls).
 */
export const metadata: Metadata = {
  title: "Workspace",
};

export default async function WorkspacePage() {
  const authUser = await requireAuthUser();
  const profile = await getCurrentUserProfile();

  if (!profile) {
    // Layout already redirects on null profile; narrow for TypeScript.
    redirect("/login");
  }

  const departments = await getAllDepartmentsWithAccess(authUser.id);
  const hasAnyAccess = departments.some((d) => d.hasAccess);

  // Gates the impact band's calculator CTAs (admin-only page). `cache()`-
  // wrapped, so this dedupes with the layout's own isCurrentUserAdmin call.
  const isAdmin = await isCurrentUserAdmin();

  // First-login: stamp welcomed_at once per account. The hero no longer
  // branches on it (it greets "Welcome back" regardless), but it remains
  // a useful first-seen signal for adoption analytics, so the write is
  // preserved. Awaited so the mutation lands before the request ends
  // (server components run request-bounded); failures are logged and
  // swallowed rather than blocking the render.
  if (profile.welcomed_at == null) {
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

  return (
    <main className="flex flex-col gap-9">
      <HomeGreeting profile={profile} hasAnyAccess={hasAnyAccess} />

      {hasAnyAccess ? (
        <>
          <div className="grid grid-cols-2 items-stretch gap-6">
            <CalendarConnectCard userId={authUser.id} />

            <Suspense fallback={<ImpactBandSkeleton />}>
              <ImpactBand userId={authUser.id} isAdmin={isAdmin} />
            </Suspense>
          </div>

          <MattersSection userId={authUser.id} />

          <IntegrationsRow />

          <ReadingSection />
        </>
      ) : null}
    </main>
  );
}

/**
 * Loading placeholder for the impact band — mirrors its composition (a heading
 * row pairing the "Impact" label with the timeframe toggle, above a tinted
 * paper-2 container that fills the column height; inside, a 2x2 grid of
 * hairline-divided cells flush at the container top, then a footer line pinned
 * to the bottom behind a hairline rule) with pulsing blocks so the layout
 * doesn't shift when the real data streams in. The h-full / flex-1 mirror keeps
 * it equal-height with the Today card in the two-column row.
 */
function ImpactBandSkeleton() {
  // Per-cell borders form the 2x2 cross divider: right + bottom on the
  // top-left, bottom on the top-right, right on the bottom-left, none on the
  // bottom-right.
  const cellBorders = [
    "border-r border-b border-hairline",
    "border-b border-hairline",
    "border-r border-hairline",
    "",
  ];
  return (
    <section
      aria-label="Impact band loading"
      className="flex h-full flex-col gap-3.5"
    >
      <div className="flex h-9 items-center justify-between">
        <div className="h-5 w-20 animate-pulse rounded bg-hairline motion-reduce:animate-none" />
        <div className="h-7 w-40 animate-pulse rounded-full bg-hairline motion-reduce:animate-none" />
      </div>
      <div className="flex flex-1 flex-col rounded-xl border border-border bg-paper-2">
        <div className="grid grid-cols-2">
          {cellBorders.map((border, i) => (
            <div key={i} className={border}>
              <div className="px-6 py-3">
                <div className="mb-1.5 h-2.5 w-20 animate-pulse rounded bg-hairline motion-reduce:animate-none" />
                <div className="h-7 w-24 animate-pulse rounded bg-hairline motion-reduce:animate-none" />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-auto flex items-baseline border-t border-hairline px-6 py-2.5">
          <div className="h-3 w-56 animate-pulse rounded bg-hairline motion-reduce:animate-none" />
        </div>
      </div>
    </section>
  );
}
