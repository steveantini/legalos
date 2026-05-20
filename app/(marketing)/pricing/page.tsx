import type { Metadata } from "next";

import { MarketingComingSoon } from "@/components/marketing/marketing-coming-soon";

export const metadata: Metadata = {
  title: "Pricing",
};

export default function PricingPage() {
  return (
    <MarketingComingSoon
      label="Pricing"
      description="How legalOS is priced — by team, by usage, by deployment shape. Designed for in-house legal teams of every size."
    />
  );
}
