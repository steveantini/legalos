import type { Metadata } from "next";

import { MarketingComingSoon } from "@/components/marketing/marketing-coming-soon";

export const metadata: Metadata = {
  title: "Documentation",
};

export default function DocumentationPage() {
  return (
    <MarketingComingSoon
      label="Documentation"
      description="Guides, references, and walkthroughs for legalOS — for legal teams adopting it and for developers integrating with it."
    />
  );
}
