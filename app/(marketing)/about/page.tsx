import type { Metadata } from "next";

import {
  MarketingClosing,
  MarketingPageShell,
  MarketingProseLink,
  MarketingSection,
} from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "About",
  description:
    "legalOS is the connected workspace and operating system for modern legal teams: agents, workflows, and tools in one place, with the team in control.",
};

export default function AboutPage() {
  return (
    <MarketingPageShell
      label="Company · About"
      title="About legalOS"
      lead="legalOS is the connected workspace and operating system for modern legal teams. It brings the agents, workflows, and tools a legal team uses every day into one place, built around how legal work actually happens, and built so the team stays in control of it."
    >
      <MarketingSection title="What legalOS is">
        <p>
          Most software sold to legal teams is a single tool that does a
          single thing, bolted onto a stack of other single tools that do not
          talk to each other. legalOS takes a different shape. It is an
          operating system: a place where a department of AI agents, the
          workflows that put them to work, and the systems your team already
          relies on come together, governed centrally and used daily. The
          work happens where the team works, not scattered across a dozen
          logins.
        </p>
      </MarketingSection>

      <MarketingSection title="Who it is for">
        <p>
          legalOS is built for in-house legal departments and law firms
          alike. For an in-house team, it is the place to handle the volume
          of legal work a business generates, with agents organized the way a
          department is. For a firm, it is the place to do client work with
          the same structure and control. The product treats both as
          first-class, because the underlying need is the same: do serious
          legal work with AI, without giving up oversight of it.
        </p>
      </MarketingSection>

      <MarketingSection title="What we believe">
        <p>
          We believe legal teams should not have to choose between using
          modern AI and keeping control of their work. They should not be
          locked to a single model, forced to hand confidential matters to a
          black box, or asked to trust that an automated system did the right
          thing. legalOS is built on the opposite conviction: that the team
          owns its tools, its data, and every action taken on its behalf. AI
          does the work; the team stays in command. The deeper statement of
          that conviction lives on our{" "}
          <MarketingProseLink href="/mission">Mission</MarketingProseLink>{" "}
          page.
        </p>
      </MarketingSection>

      <MarketingClosing>
        legalOS is software, but the practice of law is yours. The judgment,
        the responsibility, the final decision. We build the workspace; you
        do the work.
      </MarketingClosing>
    </MarketingPageShell>
  );
}
