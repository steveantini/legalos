import type { Metadata } from "next";
import Link from "next/link";

import { SETTINGS_NAV_ITEMS } from "@/lib/settings/nav";

export const metadata: Metadata = {
  title: "Settings",
};

/**
 * Settings landing — a page heading, a one-line tagline, and the
 * sub-pages rendered as a refined list, driven by `SETTINGS_NAV_ITEMS`
 * (`lib/settings/nav.ts`). The same source-of-truth array powers the
 * settings rail (`components/workspace/settings-rail.tsx`); adding a
 * sub-page is one entry there and both surfaces update.
 *
 * Refined-list LANDING pattern: each sub-page is one row (the whole row
 * is the link), showing the label, its description, and a trailing arrow,
 * with hairline rules between rows and a subtle background lift on hover.
 * No card frames and no per-row background at rest: the sub-pages are
 * navigation destinations, not contained objects, so card chrome would
 * add false weight. No icons (the no-decorative-icons discipline).
 *
 * This is the settings/admin LANDING pattern. When the Admin polish arc
 * arrives it replaces Admin's current card grid with this refined list
 * (portability principle); Admin is not modified in this arc.
 *
 * Heading and subline use the canonical page-title idiom shared by the
 * workspace home greeting and the department header (44px / 400 /
 * -0.03em over a 14.5px muted subline), so settings reads as a true peer
 * landing rather than adopting admin's heavier, one-off landing title.
 */
export default function SettingsLandingPage() {
  return (
    <main className="mx-auto w-full max-w-3xl">
      <header>
        <h1 className="text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          Settings
        </h1>
        <p className="mt-[14px] max-w-[56ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          Your personal account and preferences.
        </p>
      </header>

      <div className="mt-10">
        {SETTINGS_NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex items-baseline gap-6 border-b border-hairline py-5 transition-colors duration-release ease-release last:border-b-0 hover:bg-paper-2 hover:duration-hover hover:ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
          >
            <span className="w-[140px] shrink-0 text-[17px] font-medium text-foreground">
              {item.label}
            </span>
            <span className="flex-1 text-[13.5px] leading-[1.5] text-caption">
              {item.description}
            </span>
            <span
              aria-hidden
              className="shrink-0 text-primary opacity-60 transition-opacity duration-hover ease-soft group-hover:opacity-100 motion-reduce:transition-none"
            >
              →
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
