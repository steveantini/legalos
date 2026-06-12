import type { Metadata } from "next";
import Link from "next/link";

import {
  MarketingClosing,
  MarketingPageShell,
  MarketingProseLink,
  MarketingSection,
} from "@/components/marketing/marketing-page";
import {
  DOC_GROUP_LABELS,
  DOC_PAGES,
  type DocGroup,
} from "@/lib/marketing/documentation";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Guides for using and administering legalOS: the workspace, agents, workflows, knowledge and research, people, policy, connections, and measurement. Written from the reader's seat, honest about what ships.",
};

/**
 * The documentation hub (Documentation arc Step 1, D-158) — real guides
 * replacing the Tier-2 coming-soon shell (D-134). Hub-and-spoke on the
 * shared marketing shell, the /trust idiom: this page introduces the two
 * role groups and links every guide; each guide lives at
 * /documentation/[slug]. Public by design, administrator guides included
 * (the governance story is the trust differentiator); platform-owner
 * material is deliberately absent (docs/OPERATOR.md, internal).
 */
export default function DocumentationPage() {
  const groups: DocGroup[] = ["users", "admins"];

  return (
    <MarketingPageShell
      label="Resources · Documentation"
      title="Documentation"
      lead="Guides for using and administering legalOS, written from your seat: what each part of the product is, what you can do with it, and how. Everything here describes the product as it ships today."
    >
      {groups.map((group) => (
        <MarketingSection
          key={group}
          id={group}
          title={DOC_GROUP_LABELS[group].title}
          tagline={DOC_GROUP_LABELS[group].blurb}
        >
          <ul className="!mt-2 space-y-0">
            {DOC_PAGES.filter((page) => page.group === group).map((page) => (
              <li key={page.slug} className="border-b border-hairline last:border-b-0">
                <Link
                  href={`/documentation/${page.slug}`}
                  className="group flex items-baseline gap-4 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="w-[200px] shrink-0 text-[15px] font-medium text-foreground underline-offset-4 group-hover:underline">
                    {page.title}
                  </span>
                  <span className="hidden min-w-0 flex-1 text-[14px] leading-[1.6] text-muted-foreground min-[560px]:block">
                    {page.summary}
                  </span>
                  <span
                    aria-hidden
                    className="ml-auto shrink-0 text-primary opacity-40 transition-opacity duration-150 group-hover:opacity-100 motion-reduce:transition-none"
                  >
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </MarketingSection>
      ))}

      <MarketingClosing>
        Something missing or unclear? Documentation grows with the product;{" "}
        <MarketingProseLink href="/contact">tell us</MarketingProseLink>{" "}
        what you needed and didn&rsquo;t find. For the security story behind these
        guides, start with the{" "}
        <MarketingProseLink href="/trust">Trust Center</MarketingProseLink>.
      </MarketingClosing>
    </MarketingPageShell>
  );
}
