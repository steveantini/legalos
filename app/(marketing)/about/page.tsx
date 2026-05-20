import type { Metadata } from "next";

import { MarketingComingSoon } from "@/components/marketing/marketing-coming-soon";

export const metadata: Metadata = {
  title: "About",
};

export default function AboutPage() {
  return (
    <MarketingComingSoon
      label="About"
      description="Who's building legalOS and why. The story, the team, and what we believe about how legal work should feel."
    />
  );
}
