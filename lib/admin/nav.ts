/**
 * Single source of truth for admin nav. Consumed by both the admin rail
 * (`components/workspace/admin-rail.tsx`) and the admin landing cards
 * (`app/workspace/admin/page.tsx`). Adding a new admin tool = one entry
 * here, both surfaces update automatically. Caption order and item order
 * are the rendered order.
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
    caption: "Access",
    items: [
      {
        label: "User Access",
        href: "/workspace/admin/users",
        description:
          "Manage department access per user. Configure defaults for new users.",
      },
    ],
  },
  {
    caption: "Insights",
    items: [
      {
        label: "Adoption Metrics",
        href: "/workspace/admin/metrics",
        description:
          "KPI cards, top users, clicks per agent, and per-user / per-agent drill-downs. Toggle between sample data and your localStorage events.",
      },
    ],
  },
  {
    caption: "Value",
    items: [
      {
        label: "Productivity Calculator",
        href: "/workspace/admin/calculator",
        description:
          "Estimate hours saved, cost recovered, and ROI from agent adoption.",
      },
    ],
  },
];
