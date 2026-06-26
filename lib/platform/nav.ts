/**
 * Single source of truth for platform-admin nav (C4L/platform arc, Step 1).
 * Consumed by both the platform rail (`components/workspace/platform-rail.tsx`)
 * and the platform landing (`app/workspace/platform/page.tsx`), so adding or
 * moving a platform area is one edit here and both surfaces update. Mirrors
 * `lib/admin/nav.ts` one tier up — cross-tenant platform administration rather
 * than org administration.
 *
 * The content library landed first; cross-customer analytics is the second area
 * (analytics arc, Step 1). More arrive in later steps (billing, the rest of the
 * analytics groups); each is one entry here and both the rail and landing pick
 * it up. The shape matches `AdminNavGroup` /
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
  {
    caption: "Connections",
    items: [
      {
        label: "Connectors",
        href: "/workspace/platform/connectors",
        description:
          "The pre-vetted connector catalog legalOS ships, with each entry's status and provenance.",
      },
    ],
  },
  {
    caption: "Analytics",
    items: [
      {
        label: "Customer analytics",
        href: "/workspace/platform/analytics",
        description:
          "Adoption and engagement health across customers, the usage pulse, and platform cost.",
      },
    ],
  },
  {
    caption: "Access",
    items: [
      {
        label: "Demo access",
        href: "/workspace/platform/demo-access",
        description:
          "Mint, label, and revoke time-limited demo links, and see who has access.",
      },
    ],
  },
  {
    caption: "Signals",
    items: [
      {
        label: "Feedback",
        href: "/workspace/platform/feedback",
        description:
          "Notes customers send from inside the app, with the context they were in, and where each one stands.",
      },
    ],
  },
];

/** The Feedback area's href, shared by the landing (for the calm unseen count)
 * so the indicator attaches to the right row without hardcoding it twice. */
export const PLATFORM_FEEDBACK_HREF = "/workspace/platform/feedback";
