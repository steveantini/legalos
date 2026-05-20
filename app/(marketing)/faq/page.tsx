import type { Metadata } from "next";

import { MarketingComingSoon } from "@/components/marketing/marketing-coming-soon";

export const metadata: Metadata = {
  title: "FAQ",
};

export default function FAQPage() {
  return (
    <MarketingComingSoon
      label="FAQ"
      description="Common questions about legalOS — what it is, how it's different, how data is handled, and how to get started."
    />
  );
}
