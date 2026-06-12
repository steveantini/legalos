import type { Metadata } from "next";

import {
  MarketingClosing,
  MarketingPageShell,
  MarketingProseLink,
  MarketingSection,
} from "@/components/marketing/marketing-page";
import { SupportAssistant } from "@/components/support/support-assistant";
import { isCurrentUserPlatformOwner } from "@/lib/auth/access";
import { SUPPORT_ASSISTANT_PUBLIC } from "@/lib/support/config";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Where to get help with legalOS: documentation for everyone and for administrators, and a direct line when the answer isn't there.",
};

/**
 * The support hub (Documentation arc Step 3a, D-159): a calm routing page,
 * not a destination. Documentation is the primary route; contact is the
 * human path. The support assistant (Step 3b, D-160) now occupies the
 * designed-in middle slot — for the PLATFORM OWNER ONLY while
 * SUPPORT_ASSISTANT_PUBLIC is false (the operator's delight verdict gates
 * the public flip, which is that one config line). Anonymous and regular
 * visitors see the page exactly as it shipped without the assistant; the
 * owner check makes this route dynamic, which a light marketing page
 * absorbs without consequence.
 */
export default async function SupportPage() {
  const showAssistant =
    SUPPORT_ASSISTANT_PUBLIC || (await isCurrentUserPlatformOwner());

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

      {showAssistant ? (
        <MarketingSection
          kicker={SUPPORT_ASSISTANT_PUBLIC ? undefined : "Platform preview"}
          title="Ask the assistant"
          tagline="Answers come from the documentation, with the guides they draw on linked underneath."
        >
          <SupportAssistant />
        </MarketingSection>
      ) : null}

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
