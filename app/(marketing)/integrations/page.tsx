import type { Metadata } from "next";

import { MarketingComingSoon } from "@/components/marketing/marketing-coming-soon";

export const metadata: Metadata = {
  title: "Integrations",
};

export default function IntegrationsPage() {
  return (
    <MarketingComingSoon
      label="Integrations"
      description="The systems legalOS will connect to, coming as the integrations surface is built out. Until then, agents work inside legalOS rather than across your wider stack."
    />
  );
}
