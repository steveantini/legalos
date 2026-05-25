import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { BrowseAllCard } from "@/components/workspace/browse-all-card";
import { ContinueWorkingSection } from "@/components/workspace/continue-working-section";
import { HomeHero } from "@/components/workspace/home-hero";
import { RecentlyUsedSection } from "@/components/workspace/recently-used-section";
import {
  getAllDepartmentsWithAccess,
  getCurrentUserProfile,
  requireAuthUser,
} from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Aperture Workspace home — a personalized landing. The chrome (rail,
 * top bar, body wrapper) lives in `app/workspace/layout.tsx`; this page
 * supplies the body content.
 *
 * Structure: a personal greeting (`HomeHero`), then — for users with at
 * least one accessible department — "Continue working" (recent
 * conversations), "Recently used" (recent agents), and a "Browse all
 * departments" card. The department grid that used to live here moved to
 * `/workspace/departments`. The two data sections each fetch
 * independently and stream in behind Suspense so the hero and skeletons
 * paint immediately.
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
    <main className="flex flex-col gap-12">
      <HomeHero profile={profile} hasAnyAccess={hasAnyAccess} />

      {hasAnyAccess ? (
        <>
          <Suspense fallback={<SectionSkeleton title="Continue working" />}>
            <ContinueWorkingSection userId={authUser.id} />
          </Suspense>

          <Suspense fallback={<SectionSkeleton title="Recently used" />}>
            <RecentlyUsedSection userId={authUser.id} />
          </Suspense>

          <BrowseAllCard />
        </>
      ) : null}
    </main>
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
