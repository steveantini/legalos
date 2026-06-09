/**
 * Single source of truth for admin nav. Consumed by both the admin rail
 * (`components/workspace/admin-rail.tsx`) and the admin landing
 * (`app/workspace/admin/page.tsx`). Adding or moving an admin area = one edit
 * here, both surfaces update automatically. Caption order and item order are
 * the rendered order.
 *
 * The two captions are admin's two jobs (D-074): GOVERN the use of legalOS, and
 * MEASURE the value it delivers. The grouping is not cosmetic — it is the mental
 * model the rail and landing teach, so a super-admin sees at a glance where they
 * control and where they prove. (Unlike `lib/settings/nav.ts`, which stays a
 * flat list because grouping three settings pages would be artificial; here the
 * grouping carries real meaning.)
 *
 * `description` is user-facing copy rendered on the landing rows; keep it in the
 * considered register (one substantive line, sentence case, no em-dashes).
 *
 * The four areas are coming-soon stubs as of milestone A1; each is built out in
 * a later milestone (A2 Policy & access, A3 People, A4 Insights, A5 Evals).
 */

export interface AdminNavItem {
  label: string;
  href: string;
  description: string;
}

export interface AdminNavGroup {
  caption: string;
  items: ReadonlyArray<AdminNavItem>;
}

export const ADMIN_NAV_GROUPS: ReadonlyArray<AdminNavGroup> = [
  {
    caption: "Govern",
    items: [
      {
        label: "People",
        href: "/workspace/admin/people",
        description: "Your team, their roles, and the departments they work in.",
      },
      {
        label: "Policy & access",
        href: "/workspace/admin/policy",
        description:
          "What’s connected, who can use it, and the defaults everyone starts with.",
      },
      {
        label: "Audit log",
        href: "/workspace/admin/audit",
        description:
          "A record of role changes and account activity across your team.",
      },
    ],
  },
  {
    caption: "Measure",
    items: [
      {
        label: "Insights",
        href: "/workspace/admin/insights",
        description:
          "How your organization uses legalOS, and the time and cost it saves.",
      },
      {
        label: "Productivity",
        href: "/workspace/admin/calculator",
        description:
          "Estimate the time and cost legalOS saves, from your real usage and your assumptions.",
      },
      {
        label: "Evals",
        href: "/workspace/admin/evals",
        description: "How you check that outputs meet your standard.",
      },
    ],
  },
];
