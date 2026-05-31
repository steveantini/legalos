import type { Metadata } from "next";

import { AdminComingSoon } from "@/components/admin/admin-coming-soon";

export const metadata: Metadata = {
  title: "Policy & access",
};

/**
 * Policy & access (GOVERN) — coming-soon stub for A1. Built out first, in
 * milestone A2: the super-admin UI to edit the connection policy (allowed
 * categories, allowed providers, the capability ceiling) whose enforcement
 * already shipped in the connector arc.
 */
export default function AdminPolicyPage() {
  return (
    <AdminComingSoon
      title="Policy & access"
      description="What’s connected, who can use it, and the defaults everyone starts with."
    />
  );
}
