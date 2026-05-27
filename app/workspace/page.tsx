import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ContinueWorkingSection } from "@/components/workspace/continue-working-section";
import { CalendarConnectCard } from "@/components/workspace/home/calendar-connect-card";
import { HomeGreeting } from "@/components/workspace/home/home-greeting";
import { ImpactBand } from "@/components/workspace/home/impact-band";
import { IntegrationsRow } from "@/components/workspace/home/integrations-row";
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
 * integrations row (`IntegrationsRow`), and "Continue working" (recent
 * conversations). The impact band and Continue Working each fetch
 * independently behind their own Suspense boundaries; the greeting,
 * calendar card, and integrations row are static and paint immediately.
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
          <CalendarConnectCard />

          <Suspense fallback={<ImpactBandSkeleton />}>
            <ImpactBand userId={authUser.id} isAdmin={isAdmin} />
          </Suspense>

          <IntegrationsRow />

          <Suspense fallback={<SectionSkeleton title="Continue working" />}>
            <ContinueWorkingSection userId={authUser.id} />
          </Suspense>
        </>
      ) : null}
    </main>
  );
}

/**
 * Loading placeholder for the impact band — mirrors its frame (tinted
 * paper-2 container, four hairline-divided cells) with pulsing blocks so
 * the layout doesn't shift when the real data streams in.
 */
function ImpactBandSkeleton() {
  return (
    <section aria-label="Impact band loading" className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="h-px w-6 bg-caption" />
        <div className="h-3 w-32 animate-pulse rounded bg-hairline motion-reduce:animate-none" />
      </div>
      <div className="rounded-xl border border-border bg-paper-2 p-1">
        <div className="grid grid-cols-4 divide-x divide-hairline">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="px-6 py-5">
              <div className="mb-3 h-2.5 w-20 animate-pulse rounded bg-hairline motion-reduce:animate-none" />
              <div className="h-10 w-24 animate-pulse rounded bg-hairline motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionSkeleton({ title }: { title: string }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-[15px] font-medium tracking-[-0.005em] text-foreground">
        {title}
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[120px] animate-pulse rounded-[14px] border border-card-border bg-muted/30 motion-reduce:animate-none"
          />
        ))}
      </div>
    </section>
  );
}
