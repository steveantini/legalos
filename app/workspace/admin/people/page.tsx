import type { Metadata } from "next";

import { AdminComingSoon } from "@/components/admin/admin-coming-soon";

export const metadata: Metadata = {
  title: "People",
};

/**
 * People (GOVERN) — coming-soon stub for A1. Built out in milestone A3:
 * users, roles, and the departments they work in, plus invitations.
 */
export default function AdminPeoplePage() {
  return (
    <AdminComingSoon
      title="People"
      description="Your team, their roles, and the departments they work in."
    />
  );
}
