import type { Metadata } from "next";

import {
  MarketingClosing,
  MarketingPageShell,
  MarketingProseLink,
  MarketingSection,
} from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Where to get help with legalOS: documentation for everyone and for administrators, and a direct line when the answer isn't there.",
};

/**
 * The support hub (Documentation arc Step 3a, D-159): a calm routing page,
 * not a destination. Documentation is the primary route; contact is the
 * human path. Composed as independent sections so the support assistant
 * (Step 3b, performance-gated) slots in as a sibling section later without
 * redesign — and deliberately unmentioned until it ships (honest-state,
 * the same discipline as the features page's video scaffold).
 */
export default function SupportPage() {
  return (
    <MarketingPageShell
      label="Resources · Support"
      title="Support"
      lead="Where to get help with legalOS, whether you are evaluating the product or already working in it. Most questions are answered in the documentation; for everything else, there is a person."
    >
      <MarketingSection title="Start with the documentation">
        <p>
          The{" "}
          <MarketingProseLink href="/documentation">
            documentation
          </MarketingProseLink>{" "}
          covers every part of the product, written from your seat and kept
          current with what ships. Guides{" "}
          <MarketingProseLink href="/documentation#users">
            for everyone
          </MarketingProseLink>{" "}
          walk through getting started, the workspace, chatting with agents,
          workflows, knowledge and research, and your impact. Guides{" "}
          <MarketingProseLink href="/documentation#admins">
            for administrators
          </MarketingProseLink>{" "}
          cover people and roles, policy and access, connections, collections,
          workflows administration, insights, and the audit log. Inside the
          product, every surface links to its own guide.
        </p>
      </MarketingSection>

      <MarketingSection title="Reach a person">
        <p>
          If the documentation doesn&rsquo;t answer your question, or
          something you read doesn&rsquo;t match what you see,{" "}
          <MarketingProseLink href="/contact">tell us</MarketingProseLink>{" "}
          what you needed and didn&rsquo;t find. The same path serves demos,
          partnerships, and press.
        </p>
      </MarketingSection>

      <MarketingClosing>
        Support grows with the product. The documentation describes legalOS
        as it ships today, and when it falls short, hearing about it is how
        it gets better.
      </MarketingClosing>
    </MarketingPageShell>
  );
}
