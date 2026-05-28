/**
 * Single source of truth for the settings nav. Consumed by both the
 * settings rail (`components/workspace/settings-rail.tsx`) and the
 * settings landing cards (`app/workspace/settings/page.tsx`). Adding a
 * new settings sub-page is one entry here and both surfaces update.
 * Item order is the rendered order, sequenced by the user's mental
 * journey (identity, then experience, then integrations) rather than
 * build order.
 *
 * Flat (no captioned groups), unlike `lib/admin/nav.ts` — the settings
 * rail is a flat list per the locked design. What the two files share is
 * the idiom: one array, consumed by the rail and the landing.
 *
 * `description` is user-facing copy rendered on the landing-page cards;
 * keep it in the considered register (direct, professional, no em-dashes).
 */

export interface SettingsNavItem {
  label: string;
  href: string;
  description: string;
}

export const SETTINGS_NAV_ITEMS: ReadonlyArray<SettingsNavItem> = [
  {
    label: "Profile",
    href: "/workspace/settings/profile",
    description: "Your name, photo, and account details.",
  },
  {
    label: "Display",
    href: "/workspace/settings/display",
    description: "How legalOS looks and behaves for you.",
  },
  {
    label: "Connections",
    href: "/workspace/settings/connections",
    description: "The tools your agents can read from and write to.",
  },
];
