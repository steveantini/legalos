import type { Metadata } from "next";

import { ComingSoonContent } from "@/components/coming-soon/coming-soon";

export const metadata: Metadata = {
  title: "Connections",
};

export default function IntegrationsPage() {
  return (
    <ComingSoonContent
      label="Connections"
      description="Manage the operational systems connected to legalOS — contract lifecycle managers, document management systems, matter management, calendar, email. Active integrations and their per-source configuration land here once the Integrations surface ships."
    />
  );
}
