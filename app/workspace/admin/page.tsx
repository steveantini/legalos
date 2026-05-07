import { AdminCard } from "@/components/admin/admin-card";

const ADMIN_CARDS = [
  {
    title: "Adoption Metrics",
    description:
      "KPI cards, top users, clicks per agent, and per-user / per-agent drill-downs. Toggle between sample data and your localStorage events.",
    href: "/workspace/admin/metrics",
  },
  {
    title: "Productivity Calculator",
    description:
      "Estimate hours saved, cost recovered, and ROI from agent adoption.",
    href: "/workspace/admin/calculator",
  },
];

export default function AdminLandingPage() {
  return (
    <>
      <header>
        <h1 className="text-3xl font-semibold">Admin</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Administrative tools for legal ops. More sections arrive in later
          phases.
        </p>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ADMIN_CARDS.map((card) => (
          <AdminCard key={card.href} {...card} />
        ))}
      </div>
    </>
  );
}
