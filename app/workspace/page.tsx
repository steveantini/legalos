import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ContinueWorkingSection } from "@/components/workspace/continue-working-section";
import { HomeGreeting } from "@/components/workspace/home/home-greeting";
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
 * Structure: a personal greeting (`HomeGreeting`), then, for users with
 * at least one accessible department, "Continue working" (recent
 * conversations). That section fetches independently and streams in
 * behind Suspense so the greeting and its skeleton paint immediately.
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
        <Suspense fallback={<SectionSkeleton title="Continue working" />}>
          <ContinueWorkingSection userId={authUser.id} />
        </Suspense>
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
