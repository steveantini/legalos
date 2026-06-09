import type { Metadata } from "next";

import {
  MarketingClosing,
  MarketingPageShell,
  MarketingProseLink,
  MarketingSection,
} from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "Features",
  description:
    "A tour of legalOS: the workspace, agents organized the way a legal team is, workflows under human approval, governed connections, measurement that shows you the value, and the admin surface that makes it all safe to use.",
};

/**
 * Features marketing page: the product tour. One section per shipped
 * capability, each a tight honest description in the shared editorial
 * register. The Connections section absorbs the substance of the former
 * standalone /connections page (which now 308-redirects here, D-146);
 * its claims were verified against the connection and MCP code in D-127
 * and carry over unchanged in meaning. The Measurement section is the
 * story relocated from the landing (D-145/D-146), keeping its
 * measured-vs-estimated honesty line.
 *
 * Each section carries an anchor id so it is directly linkable. The
 * sections are also the future home for per-feature demo videos: an
 * embed will slot in at the top of a section’s body when real footage
 * exists. Deliberately no placeholder video UI now (honest-state).
 */
export default function FeaturesPage() {
  return (
    <MarketingPageShell
      label="Product · Features"
      title="Features"
      lead="One place for a legal team’s daily work: agents organized the way your department is, workflows that run under human approval, connections to the systems you already use, and measurement that shows you the value you’re getting. Here is the tour."
    >
      <MarketingSection id="workspace" title="The workspace">
        <p>
          legalOS opens to a single home for the day’s work. The launchpad
          presents your agents organized by department, so a commercial lawyer
          and a privacy lawyer each see the work that is theirs, alongside the
          conversations they have going. Conversations are kept and pick up
          where they left off, references can be attached so an agent works
          from your documents, and any response can be downloaded as a
          document. Deleted work is recoverable for thirty days.
        </p>
      </MarketingSection>

      <MarketingSection id="agents" title="Agents and departments">
        <p>
          A department of AI specialists, organized the way a legal team is.
          legalOS ships with thirteen departments spanning deal work,
          regulatory and compliance, specialized practice areas, and
          operations, each with its own agents. Those come from a curated
          library of legal agents your organization can adopt, and from your
          own people: anyone can create an agent of their own, giving it
          instructions and references, and it reads, reasons, and drafts from
          there. Access follows roles, so each person sees the departments
          that are theirs.
        </p>
      </MarketingSection>

      <MarketingSection id="workflows" title="Workflows">
        <p>
          Multi-step legal work, built without code and run under human
          approval. A workflow chains agents into a repeatable process: you
          assemble it in a no-code builder, start it from a template or from
          scratch, and run it supervised or autonomously. Either way, any
          step that would change something outside legalOS pauses for a
          person to approve before it acts. Every run keeps a complete
          step-by-step record of what ran, what was approved, and by whom.
        </p>
      </MarketingSection>

      <MarketingSection id="connections" title="Connections">
        <p>
          legalOS works with the systems your team already uses, today Google
          Workspace (Drive, Gmail, and Calendar) and your own AI model
          provider. Reading is open; acting requires a hand on the wheel: an
          agent reads connected information directly, but any action that
          would change something, like sending an email or creating a file,
          pauses for a person to approve before it runs.
        </p>
        <p>
          Connections are governed, not a free-for-all. Your administrators
          decide what is connected and what agents may reach, legalOS
          connects only to official first-party servers or to servers your
          own organization hosts, and credentials are encrypted and never
          exposed to the browser. legalOS is also model-agnostic by design:
          you can use AI through legalOS directly or bring your own model
          provider account, in which case the work runs under your own
          agreement and your own data boundary.
        </p>
      </MarketingSection>

      <MarketingSection id="measurement" title="Measurement">
        <p>
          legalOS doesn’t just do the work; it shows you what the work is
          worth. Each person sees their own impact on their home page: their
          runs, their most-used agent, and the hours and cost given back.
          Leaders see how the team is adopting legalOS: who’s active, how
          usage is trending, and where adoption hasn’t reached yet, all of it
          real, measured usage. And a built-in calculator estimates your
          return, combining measured usage with assumptions you control,
          like salary and time saved per task.
        </p>
        <p>
          Usage is measured. The return is an estimate you shape. legalOS
          labels which is which, everywhere it shows a number.
        </p>
      </MarketingSection>

      <MarketingSection id="governance" title="Admin and governance">
        <p>
          The control surface that makes the rest safe to use.
          Administrators manage who belongs and what they can reach: roles
          with least-privilege rules, invitations, and reversible
          deactivation. Policy and access sets what the organization allows,
          which kinds of connections, which model new agents start with, and
          whether agents may act read-only or read-and-write. Privileged
          actions like role changes and deactivations are recorded to an
          audit log administrators can read.
        </p>
      </MarketingSection>

      <MarketingClosing>
        Everything above describes shipped capability. For the deeper
        security story, start with the{" "}
        <MarketingProseLink href="/trust">Trust Center</MarketingProseLink>;
        when you want to see it for yourself,{" "}
        <MarketingProseLink href="/contact">get in touch</MarketingProseLink>.
      </MarketingClosing>
    </MarketingPageShell>
  );
}
