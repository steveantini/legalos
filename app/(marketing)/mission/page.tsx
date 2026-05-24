import type { Metadata } from "next";

import { MarketingComingSoon } from "@/components/marketing/marketing-coming-soon";

export const metadata: Metadata = {
  title: "Our Mission",
};

export default function MissionPage() {
  return (
    <MarketingComingSoon
      label="Our Mission"
      description="What we're trying to do with legalOS, and why we think legal work, starting with in-house teams, deserves a different kind of operating system."
    />
  );
}
