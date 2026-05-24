import type { Metadata } from "next";

import { MarketingComingSoon } from "@/components/marketing/marketing-coming-soon";

export const metadata: Metadata = {
  title: "Pricing",
};

export default function PricingPage() {
  return (
    <MarketingComingSoon
      label="Pricing"
      description="How legalOS will be priced. Pricing details are still being worked out, and this is where they'll live when the model is set."
    />
  );
}
