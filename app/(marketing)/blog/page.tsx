import type { Metadata } from "next";

import { MarketingComingSoon } from "@/components/marketing/marketing-coming-soon";

export const metadata: Metadata = {
  title: "Blog",
};

export default function BlogPage() {
  return (
    <MarketingComingSoon
      label="Blog"
      description="Writing on AI-native legal work — product updates, thinking on where the practice is going, and notes from the build."
    />
  );
}
