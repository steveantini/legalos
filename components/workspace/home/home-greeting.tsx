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
 * editorial composition: a mono eyebrow (weekday, date, time, time-of-day
 * greeting), a 44px heading that names the user, and a static subhead.
 *
 * Client component on purpose: the eyebrow's clock and the heading's
 * greeting word are derived from the user's LOCAL time. There is no
 * stored `users.timezone`, so a server render would compute these in the
 * server's timezone (UTC on Vercel) and show the wrong time and greeting
 * for anyone off UTC. Reading the browser clock keeps it correct for
 * every user without a schema change. (Adding `users.timezone` is a
 * separate future concern — it would only matter for server-rendered,
 * timezone-dependent surfaces such as scheduled email, not this.)
 *
 * To avoid a hydration mismatch, the SSR + first client render use a
 * time-agnostic fallback: no eyebrow text and a "Welcome back" heading
 * word. Once hydrated, `useSyncExternalStore` flips and `now` resolves
 * from the browser clock, so the eyebrow and the real greeting word paint
 * on the next render. The swap is a single re-render with no layout
 * shift — an invisible eyebrow placeholder reserves the line's height
 * across the transition.
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
  const eyebrowText = now ? formatEyebrow(now) : "";

  return (
    <section className="flex flex-col gap-[14px]">
      {eyebrowText ? (
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-caption">
          {eyebrowText}
        </p>
      ) : (
        // Invisible placeholder holds the eyebrow's line height so the
        // heading does not shift when the real eyebrow paints after mount.
        <p
          aria-hidden="true"
          className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-caption opacity-0"
        >
          &nbsp;
        </p>
      )}
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
        legalOS, your team’s departments, knowledge, workflows, and
        integrations, all in one place.
      </p>
    </section>
  );
}

/**
 * Builds the eyebrow string `{weekday} · {monthDay} · {time} · {greeting}`,
 * e.g. "Wed · May 27 · 9:48 AM · Good morning". Formatted in en-US (the
 * product's default locale; there is no per-user locale stored) against
 * the browser's local timezone, which `Intl.DateTimeFormat` uses when no
 * `timeZone` option is given. The time is uppercased so the meridiem
 * reads "AM"/"PM" regardless of how the runtime's ICU renders it.
 */
function formatEyebrow(now: Date): string {
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(
    now,
  );
  const monthDay = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(now);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(now)
    .toUpperCase();

  return `${weekday} · ${monthDay} · ${time} · ${greetingByHour(now.getHours())}`;
}
