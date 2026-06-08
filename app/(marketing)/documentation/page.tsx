import type { Metadata } from "next";

import {
  MarketingClosing,
  MarketingPageShell,
} from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Guides and references for using legalOS. Getting started, agents and workflows, connecting your tools, and administering your workspace, on the way.",
};

/**
 * Honest shell (Tier 2): documentation is in progress. Describes what is
 * coming and offers direct help to early users in the meantime. Mirrors the
 * short-page idiom from the Contact page on the shared shell.
 */
export default function DocumentationPage() {
  return (
    <MarketingPageShell
      label="Resources · Documentation"
      title="Documentation"
      lead="Guides and references for using legalOS."
    >
      <p className="mt-6 text-[15px] leading-[1.75] text-ink-2">
        Documentation is in progress. As legalOS grows, this is where you will
        find guides for getting started, working with agents and workflows,
        connecting your tools, and administering your workspace. In-product
        help is also on the way. If you are an early user and need help in the
        meantime, reach out and we will help you directly.
      </p>

      <MarketingClosing>
        Use the request access option on the home page to be in touch.
      </MarketingClosing>
    </MarketingPageShell>
  );
}
