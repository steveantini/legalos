import type { Metadata } from "next";

import { MarketingComingSoon } from "@/components/marketing/marketing-coming-soon";

export const metadata: Metadata = {
  title: "Legal",
};

export default function LegalPage() {
  return (
    <MarketingComingSoon
      label="Legal"
      description="Terms of service, privacy policy, and data processing terms for legalOS, the formal documents that govern how the product is offered and how data is handled."
    />
  );
}
