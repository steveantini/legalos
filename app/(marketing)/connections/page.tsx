import type { Metadata } from "next";

import {
  MarketingClosing,
  MarketingPageShell,
  MarketingProseLink,
  MarketingSection,
} from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "Connections",
  description:
    "legalOS works with the systems your team already uses: Google Workspace and your own AI model provider, governed by your administrators, with a person approving any action that changes anything.",
};

/**
 * Connections marketing page (Tier 1b), renamed from Integrations to
 * match the in-product vocabulary; /integrations 308-redirects here.
 * Capability claims on this page were verified against the connection
 * and MCP code (registry, read/write gating, credential custody, BYO
 * resolution) before publication; see D-127.
 */
export default function ConnectionsPage() {
  return (
    <MarketingPageShell
      label="Product · Connections"
      title="Connections"
      lead="legalOS works with the systems your team already uses. Connections let your agents reach the tools and information they need, under governance you control, and with a person approving any action that changes anything."
    >
      <MarketingSection title="How connections work">
        <p>
          A connection links legalOS to an outside system so your agents can
          work with it. Today that includes Google Workspace, where your team
          can connect Google Drive, Gmail, and Calendar, and your own AI
          model provider. When an agent uses a connection, reading
          information happens directly, but any action that would change
          something, such as sending an email or creating a file, pauses for
          a person to approve before it runs. Reading is open; acting
          requires a hand on the wheel.
        </p>
      </MarketingSection>

      <MarketingSection title="Connections are governed">
        <p>
          Connections are not a free-for-all. Your administrators decide what
          is connected and what your agents are allowed to reach. legalOS
          only connects to official first-party servers or to servers your
          own organization hosts, never to an arbitrary third party.
          Credentials are encrypted and never exposed to the browser. A
          connection is something your organization grants deliberately, not
          something that happens to you.
        </p>
      </MarketingSection>

      <MarketingSection title="Bring your own model">
        <p>
          legalOS is model-agnostic by design. You can use AI through legalOS
          directly, or connect your own model provider account, in which case
          the work runs under your own agreement and your own data boundary.
          This is the foundation for where the product is headed: the ability
          to run the models you choose, on terms you set, including your own
          infrastructure. You can read more about that on our{" "}
          <MarketingProseLink href="/mission">Mission</MarketingProseLink>{" "}
          page.
        </p>
      </MarketingSection>

      <MarketingClosing>
        Your tools, connected on your terms, with every action accountable to
        a person.
      </MarketingClosing>
    </MarketingPageShell>
  );
}
