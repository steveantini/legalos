import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUserProfile } from "@/lib/auth/access";

export const metadata: Metadata = {
  title: "Start a demo?",
};

/**
 * Consent interstitial for the demo session guard (D-170). Reached only when a
 * /demo/<token> link is opened while a real account is signed in: continuing
 * replaces that session with the demo user (one Supabase cookie per browser),
 * so we ask first instead of silently swapping. Continue returns to the consume
 * route with ?confirm=demo, which the route honors; Stay leaves the real session
 * untouched.
 *
 * Static segment under /demo, so it takes precedence over the sibling dynamic
 * [token] route; public via the proxy's /demo allowlist.
 */
export default async function DemoConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) redirect("/");

  const profile = await getCurrentUserProfile();
  // No real session to protect (anonymous, or signed out since the redirect):
  // there is nothing to confirm, so flow straight into the demo.
  if (!profile) redirect(`/demo/${token}?confirm=demo`);

  const identifier = profile.full_name?.trim() || profile.email;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-20 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary">
        Demo
      </p>

      <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
        Start a demo on this browser?
      </h1>

      <p className="mt-6 max-w-prose text-base leading-relaxed text-muted-foreground">
        You are signed in as{" "}
        <span className="text-foreground">{identifier}</span>. Continuing opens a
        demo workspace and signs you out of your account in this browser. You can
        sign back in anytime.
      </p>

      <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
        <Link
          href={`/demo/${token}?confirm=demo`}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Continue to demo
        </Link>
        <Link
          href="/workspace"
          className="inline-flex h-10 items-center justify-center rounded-md px-5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Stay signed in
        </Link>
      </div>
    </main>
  );
}
