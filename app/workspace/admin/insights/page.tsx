import type { Metadata } from "next";

import { AdminComingSoon } from "@/components/admin/admin-coming-soon";

export const metadata: Metadata = {
  title: "Insights",
};

/**
 * Insights (MEASURE) — coming-soon stub for A1. Built out in milestone A4:
 * usage analytics and ROI as one section, two lenses (absorbing today's
 * Adoption Metrics and Productivity Calculator).
 */
export default function AdminInsightsPage() {
  return (
    <AdminComingSoon
      title="Insights"
      description="How your organization uses legalOS, and the time and cost it saves."
    />
  );
}
