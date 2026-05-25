import type { Metadata } from "next";

import { ComingSoonContent } from "@/components/coming-soon/coming-soon";

export const metadata: Metadata = {
  title: "Guides",
};

export default function HelpPage() {
  return (
    <ComingSoonContent
      label="Guides"
      description="Walkthroughs, how-tos, and product references for every part of legalOS. The browseable guides library lands here once the Help surface ships; an AI-powered help chat that knows the product end-to-end is on the roadmap."
    />
  );
}
