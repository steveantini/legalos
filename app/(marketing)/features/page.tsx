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
    "A tour of legalOS: the workspace, agents organized the way a legal team is, workflows under human approval, governed connections, knowledge that answers from your own documents, measurement that shows you the value, the admin surface that makes it all safe to use, and the control that keeps it all on your terms.",
};

/**
 * Features marketing page: the product tour. One section per shipped
 * capability, each a tight honest description in the shared editorial
 * register. The Connections section absorbs the substance of the former
 * standalone /connections page (which now 308-redirects here, D-146);
 * its claims were verified against the connection and MCP code in D-127
 * and carry over unchanged in meaning, with the pre-vetted connector
 * catalog story added in D-150 (its status claims, Google verified and
 * the rest pre-vetted, mirror the registry's catalog metadata exactly).
 * The Knowledge section (D-156, the arc close) sits after Connections —
 * it is built on them — and claims only shipped reality: collections
 * over connected repositories, live reading with citations, the in-chat
 * tool; no web or trusted-source blending is claimed.
 * The Measurement section is the
 * story relocated from the landing (D-145/D-146), keeping its
 * measured-vs-estimated honesty line. The Control section (D-167-era, after
 * governance, the tour's culminating differentiator) gathers the
 * control-and-flexibility theme into one place: meets-you-where-you-are
 * (first-party or self-hosted servers; model-agnostic by design),
 * your-models-your-call (managed or BYO key, no lock-in), and
 * experts-in-command (the autonomy dial stated honestly, with the writes-pause
 * rule that holds in every mode). No on-prem deployment is claimed: models run
 * managed or under your own provider account, not as a legalOS on-prem install.
 *
 * Each section carries an anchor id so it is directly linkable. The
 * sections are also the future home for per-feature demo videos: an
 * embed will slot in at the top of a section’s body when real footage
 * exists. Deliberately no placeholder video UI now (honest-state).
 */
/**
 * A short run-in lead-in: the opening phrase of a section's body, emphasized so
 * a skimming reader catches the feature's essence in one pass. Reuses the page's
 * existing weight (font-semibold) and color (text-foreground) at body size, so
 * it lifts from the body's text-ink-2 yet stays clearly subordinate to the 28px
 * section headings. Where the sentence continues with a space (not a comma or
 * semicolon), the caller uses the {" "} idiom so the space survives the build
 * (the SWC newline-after-element drop, D-167).
 */
function LeadIn({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-foreground">{children}</strong>;
}

export default function FeaturesPage() {
  return (
    <MarketingPageShell
      label="Product · Features"
      title="Features"
      lead="One place for a legal team’s daily work: agents organized the way your department is, workflows that run under human approval, connections to the systems you already use, knowledge that answers from your own documents, and measurement that shows you the value you’re getting. Here is the tour."
    >
      <MarketingSection id="workspace" title="The workspace">
        <p>
          <LeadIn>legalOS opens to a single home</LeadIn>{" "}for the day’s
          work. The launchpad
          presents your agents organized by department, so a commercial lawyer
          and a privacy lawyer each see the work that is theirs, alongside the
          conversations they have going. Conversations are kept and pick up
          where they left off, references can be attached so an agent works
          from your documents, and any response can be downloaded as a
          document. Deleted work is recoverable for thirty days.
        </p>
        <p>
          <LeadIn>A Desk for the reading you follow.</LeadIn>{" "}Add the
          Substacks, podcasts, and news sources you keep up with by pasting a
          link: a feed, an ordinary page (legalOS finds the feed for you), or an
          Apple Podcasts show (resolved to the show’s feed). Each source becomes
          a card with its latest post, linking out to read it. The feeds are
          personal to you and managed by you. Curated reading chosen for your
          role may join your own feeds here in time.
        </p>
      </MarketingSection>

      <MarketingSection id="agents" title="Agents and departments">
        <p>
          <LeadIn>A department of AI specialists</LeadIn>, organized the way a
          legal team is.
          legalOS ships with thirteen departments spanning deal work,
          regulatory and compliance, specialized practice areas, and
          operations, each with its agents in three clearly marked tiers:
          Approved agents your department has vetted and tested, a curated
          library of Anthropic&rsquo;s legal agents ready to use, and My
          agents, the ones your own people create by giving them instructions
          and references. A new user reads the trust model at a glance, and
          access follows roles, so each person sees the departments that are
          theirs.
        </p>
      </MarketingSection>

      <MarketingSection id="workflows" title="Workflows">
        <p>
          <LeadIn>Multi-step legal work</LeadIn>, built without code and run
          under human approval. A workflow chains agents into a repeatable process: you
          assemble it in a no-code builder, start it from a template or from
          scratch, and run it supervised or autonomously. Either way, any
          step that would change something outside legalOS pauses for a
          person to approve before it acts. Every run keeps a complete
          step-by-step record of what ran, what was approved, and by whom.
        </p>
      </MarketingSection>

      <MarketingSection id="connections" title="Connections">
        <p>
          <LeadIn>legalOS works with the systems</LeadIn>{" "}your team already
          uses, and it ships
          knowing what those are. A pre-vetted catalog covers the tools legal
          teams live in: contract lifecycle systems like Ironclad and DocuSign,
          document management like iManage and Box, e-discovery like Everlaw,
          court data and research like CourtListener and Trellis, and the
          productivity layer around them, Google Workspace, Slack, and Linear
          among others. Enabling one is a toggle plus your credentials, inside
          the same trusted boundary. Google Workspace is verified end to end
          today; the rest of the catalog is pre-vetted rather than live-tested,
          and each connector is verified as customers enable it.
        </p>
        <p>
          <LeadIn>Your calendar, on your home.</LeadIn>{" "}Connect Google
          Calendar in one click and today&rsquo;s schedule appears on your home,
          gathered across every calendar you keep visible and merged in time
          order, read-only: legalOS shows your meetings for the day and never
          writes to your calendar.
        </p>
        <p>
          Reading is open; acting requires a hand on the wheel: an agent reads
          connected information directly, but any action that would change
          something, like sending an email or creating a file, pauses for a
          person to approve before it runs.
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

      <MarketingSection id="knowledge" title="Knowledge">
        <p>
          <LeadIn>legalOS doesn&rsquo;t ask you to migrate</LeadIn>{" "}your
          knowledge. It lives scattered across drives, document systems, and
          contract repositories. Administrators draw named collections over
          the repositories you already use, like a contracts folder in Google
          Drive, and every collection shows exactly where its documents live.
          Then anyone can ask an institutional question across the
          collections they choose, like which of our vendor agreements
          auto-renew, and get a citation-backed answer with per-document
          findings. Every document in scope is read live, where it lives;
          nothing is copied or stored, and legalOS keeps only an inventory of
          titles, never the documents.
        </p>
        <p>
          Your agents can draw on the same capability in conversation,
          reading a small scope inline and citing the documents, with larger
          questions pointed at the Research page built for them. Each run
          shows an honest preview before it starts, and anything that
          couldn&rsquo;t be read is reported plainly rather than silently
          dropped.
        </p>
      </MarketingSection>

      <MarketingSection id="measurement" title="Measurement">
        <p>
          <LeadIn>legalOS doesn’t just do the work</LeadIn>; it shows you what
          the work is
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
          <LeadIn>The control surface</LeadIn>{" "}that makes the rest safe to
          use. Administrators manage who belongs and what they can reach: roles
          with least-privilege rules, invitations, and reversible
          deactivation. Policy and access sets what the organization allows:
          which kinds of connections, which model new agents start with,
          whether agents may act read-only or read-and-write, and how many
          documents a single research run may read. Privileged actions like
          role changes and deactivations are recorded to an audit log
          administrators can read.
        </p>
      </MarketingSection>

      <MarketingSection id="control" title="Control on your terms">
        <p>
          legalOS shapes itself to how your team already operates, not the
          other way around. A person with the expertise stays in command of the
          work.
        </p>
        <p>
          <LeadIn>Meets you where you are.</LeadIn>{" "}Instead of asking your
          team to move its work
          onto a fixed stack, legalOS reaches the systems you already run,
          connecting to official first-party servers or to ones your own
          organization hosts. It is model-agnostic by design, built to run on
          the models you choose rather than a single engine wired in for you, so
          your environment stays yours.
        </p>
        <p>
          <LeadIn>Your models, your call.</LeadIn>{" "}Use the AI managed
          through legalOS, or bring
          your own model-provider account and run the work under your own
          agreement and data boundary. Either way you hold the choice of model
          and your exposure to its cost, instead of being locked to one
          vendor&rsquo;s pricing. The model is a connection you control, not a
          decision made for you.
        </p>
        <p>
          <LeadIn>Experts stay in command.</LeadIn>{" "}The people with the
          domain expertise keep
          agency over their departments and over what the agents do. You decide
          how much autonomy a run carries, from fully supervised to more
          independent, and one line never moves: any action that would change
          something outside legalOS pauses for a person to approve before it
          happens, in every mode, including the most autonomous. legalOS takes
          on the repetitive toil; the judgment stays human.
        </p>
        <p>
          <LeadIn>Control where it counts:</LeadIn>{" "}the models you run on,
          the privacy of your work, and the connection to the tools your team
          already uses.
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
