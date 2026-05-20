import type { Metadata } from "next";

import { MarketingComingSoon } from "@/components/marketing/marketing-coming-soon";

export const metadata: Metadata = {
  title: "Integrations",
};

export default function IntegrationsPage() {
  return (
    <MarketingComingSoon
      label="Integrations"
      description="The systems legalOS connects to — contract lifecycle managers, document management, calendar, email, research. Configure once; agents read and write across your stack."
    />
  );
}
