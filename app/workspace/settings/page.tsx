import type { Metadata } from "next";

import { LandingRow } from "@/components/workspace/landing-row";
import { SETTINGS_PAGE_MAX_WIDTH } from "@/lib/settings/layout";
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
 * is the link), showing the label, its description, and a trailing arrow.
 * Rows render through the shared `LandingRow` — the filled landing standard
 * (D-075): a calm `bg-paper-2` fill at rest that deepens to `bg-secondary`
 * on hover, with a hairline divider on the wrapper. No card frames and no
 * icons (the no-decorative-icons discipline). This treatment is shared with
 * the admin landing through the one component, so the two cannot drift; it
 * supersedes the earlier flat-at-rest rows.
 *
 * Heading and subline use the canonical page-title idiom shared by the
 * workspace home greeting and the department header (44px / 400 /
 * -0.03em over a 14.5px muted subline), so settings reads as a true peer
 * landing rather than adopting admin's heavier, one-off landing title.
 */
export default function SettingsLandingPage() {
  return (
    <main className={`w-full ${SETTINGS_PAGE_MAX_WIDTH}`}>
      <header>
        <h1 className="text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          Settings
        </h1>
        <p className="mt-[14px] max-w-[56ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          Your personal account and preferences.
        </p>
      </header>

      {/* Filled landing rows via the shared `LandingRow` (D-075): the same
          treatment the admin landing uses, so the two landings share one row
          language. */}
      <div className="mt-12">
        {SETTINGS_NAV_ITEMS.map((item) => (
          <LandingRow
            key={item.href}
            label={item.label}
            description={item.description}
            href={item.href}
          />
        ))}
      </div>
    </main>
  );
}
