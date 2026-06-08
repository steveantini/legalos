import type { Metadata } from "next";

import {
  MarketingClosing,
  MarketingPageShell,
  MarketingProseLink,
} from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Writing on building legalOS and on where AI-native legal work is going.",
};

/**
 * Honest shell (Tier 2): no posts yet, said plainly, pointing readers to
 * About and Mission in the meantime. Mirrors the short-page idiom from the
 * Contact page (lead + one body paragraph + closing) on the shared shell.
 */
export default function BlogPage() {
  return (
    <MarketingPageShell
      label="Resources · Blog"
      title="Blog"
      lead="Writing on building legalOS and on where AI-native legal work is going."
    >
      <p className="mt-6 text-[15px] leading-[1.75] text-ink-2">
        We do not have any posts yet. When we have something worth your time,
        on the product, on how legal teams are using AI, or on the thinking
        behind legalOS, it will appear here.
      </p>

      <MarketingClosing>
        Until then, the{" "}
        <MarketingProseLink href="/about">About</MarketingProseLink> and{" "}
        <MarketingProseLink href="/mission">Mission</MarketingProseLink> pages
        say the most about what we are building, and why.
      </MarketingClosing>
    </MarketingPageShell>
  );
}
