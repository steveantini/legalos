import type { Metadata } from "next";

import { AdminComingSoon } from "@/components/admin/admin-coming-soon";

export const metadata: Metadata = {
  title: "Evals",
};

/**
 * Evals (MEASURE) — coming-soon stub for A1. Built out in milestone A5:
 * how a super-admin checks that agent outputs meet their standard.
 */
export default function AdminEvalsPage() {
  return (
    <AdminComingSoon
      title="Evals"
      description="How you check that outputs meet your standard."
    />
  );
}
