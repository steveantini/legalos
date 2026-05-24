import type { Metadata } from "next";

import { MarketingComingSoon } from "@/components/marketing/marketing-coming-soon";

export const metadata: Metadata = {
  title: "Security",
};

export default function SecurityPage() {
  return (
    <MarketingComingSoon
      label="Security"
      description="How legalOS protects your data and respects your operational requirements. The full security posture, covering encryption, access control, hosting, audit, and compliance, will be detailed here as it's formalized."
    />
  );
}
