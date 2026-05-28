import type { Metadata } from "next";
import Link from "next/link";

import { SETTINGS_NAV_ITEMS } from "@/lib/settings/nav";

export const metadata: Metadata = {
  title: "Settings",
};

/**
 * Settings landing — a page heading, a one-line tagline, and a single
 * column of cards driven by `SETTINGS_NAV_ITEMS` (`lib/settings/nav.ts`).
 * The same source-of-truth array powers the settings rail
 * (`components/workspace/settings-rail.tsx`); adding a sub-page is one
 * entry there and both surfaces update.
 *
 * LANDING CARD pattern: each card is a clickable link to its sub-page,
 * showing a label and a description, with a subtle background shift on
 * hover and a trailing arrow that fades in (in slate) on hover. No icons
 * (per the no-decorative-icons discipline). A single column reads more
 * considered than a grid for a short list. This is the pattern the admin
 * landing will adopt when its own polish arc arrives; admin is not
 * modified in this arc.
 */
export default function SettingsLandingPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-[22px] font-medium tracking-[-0.01em] text-foreground">
          Settings
        </h1>
        <p className="max-w-[60ch] font-mono text-[12px] leading-[1.5] text-caption">
          Your personal account and preferences.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        {SETTINGS_NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex items-center justify-between gap-6 rounded-xl border border-border bg-card px-7 py-6 transition-colors duration-release ease-release hover:bg-paper-2 hover:duration-hover hover:ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
          >
            <div className="min-w-0">
              <p className="text-[17px] font-medium text-foreground">
                {item.label}
              </p>
              <p className="mt-1 text-[13.5px] leading-[1.5] text-caption">
                {item.description}
              </p>
            </div>
            <span
              aria-hidden
              className="shrink-0 text-primary opacity-0 transition-opacity duration-hover ease-soft group-hover:opacity-100 motion-reduce:transition-none"
            >
              →
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
