"use client";

import { useSyncExternalStore } from "react";

/**
 * The user's LOCAL current date, rendered from the browser clock — the one
 * honest source for "what day is it" without a stored timezone. Server
 * components render dates with the SERVER clock (UTC on Vercel), which
 * rolls to tomorrow during US evenings; this island is the shared fix for
 * every user-facing current-date display (the workspace top bar, the
 * landing top bar, the home Today card). Stored-event timestamps are NOT
 * this component's business — those are correctly absolute.
 *
 * Hydration-safe via the HomeGreeting idiom: useSyncExternalStore yields
 * false during SSR + first client render (the span renders empty, no
 * mismatch) and true once hydrated, when the browser-clock date paints.
 * The lint-clean alternative to a mount effect calling setState.
 */
const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/** "long" = "Friday · June 12" (the top-bar idiom); "short" = "Fri, Jun 12". */
export function LocalDate({
  variant,
  className,
}: {
  variant: "long" | "short";
  className?: string;
}) {
  const hydrated = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  let label = "";
  if (hydrated) {
    const now = new Date();
    if (variant === "long") {
      const weekday = new Intl.DateTimeFormat("en-US", {
        weekday: "long",
      }).format(now);
      const monthDay = new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
      }).format(now);
      label = `${weekday} · ${monthDay}`;
    } else {
      label = now.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    }
  }

  return <span className={className}>{label}</span>;
}
