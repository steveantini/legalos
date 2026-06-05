/**
 * Single source of truth for platform-admin nav (C4L/platform arc, Step 1).
 * Consumed by both the platform rail (`components/workspace/platform-rail.tsx`)
 * and the platform landing (`app/workspace/platform/page.tsx`), so adding or
 * moving a platform area is one edit here and both surfaces update. Mirrors
 * `lib/admin/nav.ts` one tier up — cross-tenant platform administration rather
 * than org administration.
 *
 * The content library landed in Step 3 (the first real area). More arrive in
 * later steps (billing / cross-tenant analytics); each is one entry here and
 * both the rail and landing pick it up. The shape matches `AdminNavGroup` /
 * `AdminNavItem` so a future shared landing/rail abstraction can consume both
 * without divergence.
 *
 * `description` is user-facing copy rendered on the landing rows; keep it in the
 * considered register (one substantive line, sentence case, no em-dashes).
 */

export interface PlatformNavItem {
  label: string;
  href: string;
  description: string;
}

export interface PlatformNavGroup {
  caption: string;
  items: ReadonlyArray<PlatformNavItem>;
}

export const PLATFORM_NAV_GROUPS: ReadonlyArray<PlatformNavGroup> = [
  {
    caption: "Content",
    items: [
      {
        label: "Content library",
        href: "/workspace/platform/content",
        description:
          "The curated agent libraries legalOS ships, and refreshing them from source.",
      },
    ],
  },
];
