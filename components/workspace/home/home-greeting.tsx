"use client";

import { useSyncExternalStore } from "react";

import { siteConfig } from "@/config/site";
import { greetingByHour } from "@/lib/workspace/home/greeting-by-hour";
import { getFirstName, type ProfileShape } from "@/lib/workspace/profile";

type HomeGreetingProps = {
  profile: ProfileShape;
  hasAnyAccess: boolean;
};

// useSyncExternalStore wiring for a hydration-safe "are we on the client
// yet?" flag. The store never changes after hydration, so `subscribe` is a
// no-op; the snapshot is a boolean primitive (stable under Object.is, so no
// render loop) that is false during SSR + the first client render and true
// once hydrated. This is the lint-clean alternative to a mount effect that
// calls setState — that pattern trips react-hooks/set-state-in-effect and
// can cascade renders. Module-level so the references stay stable per render.
const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * Personalized greeting at the top of the workspace home (/workspace).
 * Replaces the prior product-tagline workspace hero with Direction A's
 * editorial composition: a 44px heading that names the user, then a
 * static subhead.
 *
 * Client component on purpose: the heading's greeting word ("Good
 * morning" / "Good afternoon" / ...) is derived from the user's LOCAL
 * time. There is no stored `users.timezone`, so a server render would
 * compute it in the server's timezone (UTC on Vercel) and show the wrong
 * greeting for anyone off UTC. Reading the browser clock keeps it correct
 * for every user without a schema change. (Adding `users.timezone` is a
 * separate future concern — it would only matter for server-rendered,
 * timezone-dependent surfaces such as scheduled email, not this.)
 *
 * To avoid a hydration mismatch, the SSR + first client render use a
 * time-agnostic "Welcome back" heading word. Once hydrated,
 * `useSyncExternalStore` flips and `now` resolves from the browser clock,
 * so the real greeting word paints on the next render. The heading keeps
 * its height across the swap, so there is no layout shift.
 */
export function HomeGreeting({ profile, hasAnyAccess }: HomeGreetingProps) {
  const hydrated = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );
  // Resolved only after hydration so SSR and the first client render agree
  // (both null); reading new Date() here picks up the browser's local
  // clock and timezone.
  const now = hydrated ? new Date() : null;

  if (!hasAnyAccess) {
    const requestAccessHref =
      `mailto:${siteConfig.adminEmail}` +
      `?subject=${encodeURIComponent("Request access to legalOS")}` +
      `&body=${encodeURIComponent(
        "Hi, I'd like to request access to a department in legalOS.",
      )}`;

    return (
      <section>
        <h1 className="max-w-[28ch] text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          Welcome to legalOS.
        </h1>
        <p className="mt-[14px] max-w-[56ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          Your org admin hasn’t granted you access to any departments yet.{" "}
          <a
            href={requestAccessHref}
            className="text-primary underline-offset-4 transition-colors hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Request access from your admin.
          </a>
        </p>
      </section>
    );
  }

  const firstName = getFirstName(profile);
  const greetingPhrase = now ? greetingByHour(now.getHours()) : "Welcome back";

  return (
    <section className="flex flex-col gap-[14px]">
      <h1 className="max-w-[28ch] text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
        {firstName ? (
          <>
            {greetingPhrase}, <span className="text-primary">{firstName}</span>.
          </>
        ) : (
          <>{greetingPhrase}.</>
        )}
      </h1>
      <p className="max-w-[80ch] text-[14.5px] leading-[1.5] text-muted-foreground">
        <strong className="font-medium text-foreground">legalOS</strong>, your
        team’s departments, knowledge, workflows, and integrations, all in one
        place.
      </p>
    </section>
  );
}
