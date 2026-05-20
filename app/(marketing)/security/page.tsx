import type { Metadata } from "next";

import { MarketingComingSoon } from "@/components/marketing/marketing-coming-soon";

export const metadata: Metadata = {
  title: "Security",
};

export default function SecurityPage() {
  return (
    <MarketingComingSoon
      label="Security"
      description="How legalOS handles your data — encryption, access control, audit trails, hosting, and the compliance posture that in-house legal teams need from their tools."
    />
  );
}
