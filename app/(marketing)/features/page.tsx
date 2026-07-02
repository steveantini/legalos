import type { Metadata } from "next";

import {
  AdminSurface,
  DepartmentsSurface,
  KnowledgeSurface,
  WorkflowsSurface,
  WorkspaceSurface,
} from "@/components/landing/platform/platform-surfaces";
import {
  FeatureRow,
  FeatureWindow,
} from "@/components/marketing/feature-visual";
import {
  MarketingClosing,
  MarketingPageShell,
  MarketingProseLink,
  MarketingSection,
} from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "Features",
  description:
    "A tour of legalOS: the workspace, agents organized the way a legal team is, knowledge that answers from your own documents, workflows under human approval, the admin and governance surface, and the control that keeps it all on your terms.",
};

/**
 * Features marketing page: the product tour, reorganized into six sections
 * (D-218): the workspace, agents and departments, knowledge, workflows, admin
 * and governance, and control on your terms. Document Comparison folded into
 * Agents (the built-ins beat); Connections folded into Governance (where
 * connections actually live in the product); Measurement folded into
 * Governance as the MEASURE half. Each section claims only shipped reality and
 * carries an anchor id so it is directly linkable; the former /connections page
 * 308-redirects to #governance (D-146 remapped). The sections are the future
 * home for per-feature demo videos: an embed slots in at the top of a section's
 * body when real footage exists. Deliberately no placeholder video UI now
 * (honest-state). Claims are mapped in docs/FEATURES_CLAIMS.md (D-157).
 *
 * Two staleness fixes are baked into this copy: the false "conversations that
 * pick up where they left off" claim is removed (no conversation-history UI
 * exists), and connected-tool use is framed as a governed capability (reading
 * open, writes built to pause for approval) rather than asserting agents
 * actively run connected tools today, matching the softened docs (c4cbd6c).
 */
/**
 * A short run-in lead-in or an inline bolded term: emphasized so a skimming
 * reader catches the essence in one pass. Reuses the page's weight
 * (font-semibold) and color (text-foreground) at body size. Where the sentence
 * continues with a space, the caller uses the {" "} idiom so the space survives
 * the build (the SWC newline-after-element drop, D-167).
 */
function LeadIn({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-foreground">{children}</strong>;
}

export default function FeaturesPage() {
  return (
    <MarketingPageShell
      label="Product · Features"
      title="Features"
      lead="One place for a legal team’s daily work: agents organized the way your department is, workflows that run under human approval, knowledge that answers from your own documents, and the controls and measurement that make it safe to adopt. Here is the tour."
      alignToWideBody
    >
      {/* The visual tour breaks out of the 736px reading column into a wider
          band (D-219) so each window sits beside its prose, alternating sides,
          in the landing's rhythm. The header (eyebrow, title, lead) and back
          link (via alignToWideBody), plus the prose-strong close below (its own
          wrapper), all shift to that band's left edge at ≥1181px, so the whole
          page reads down one left spine; the prose keeps a readable measure. */}
      <div className="min-[1181px]:-mx-[200px]">
        <FeatureRow
          id="workspace"
          title="The workspace"
          visual={
            <FeatureWindow active="home" crumbs={["Home"]}>
              <WorkspaceSurface compact />
            </FeatureWindow>
          }
        >
          <p>
            <LeadIn>A single home for the day’s work.</LeadIn>{" "}legalOS opens
            to a launchpad that presents your agents organized by department, so
            a commercial lawyer and a privacy lawyer each see the work that is
            theirs. Attach references so an agent works from your documents,
            download any response as a document, and recover deleted work for
            thirty days.
          </p>
          <p>
            <LeadIn>Today, your schedule on your home.</LeadIn>{" "}Connect Google
            Calendar in one click and the day’s schedule appears on your home,
            read only, merged across your calendars in time order with a live
            now-and-next marker. legalOS never writes to your calendar.
          </p>
          <p>
            <LeadIn>Impact, the value you can see.</LeadIn>{" "}Your home shows
            your own measured usage: your agent runs and your most-used agent,
            and once an administrator sets up the productivity calculator, the
            hours and cost given back. Usage is measured; the return is an
            estimate you shape, and legalOS labels which is which.
          </p>
          <p>
            <LeadIn>Matters (coming soon).</LeadIn>{" "}Your active matters and
            deals will sync from your CLM or matter-management tool, with status,
            deadlines, and value in flight. legalOS reads your system of record;
            it never writes to it.
          </p>
          <p>
            <LeadIn>A Desk for the reading you follow.</LeadIn>{" "}Add the
            newsletters, podcasts, and news sources you keep up with by pasting a
            link, and each becomes a card with its latest post. The feeds are
            personal to you and managed by you.
          </p>
        </FeatureRow>

        <FeatureRow
          id="agents"
          title="Agents and departments"
          windowLeft
          visual={
            <FeatureWindow active="departments" crumbs={["Departments"]}>
              <DepartmentsSurface compact />
            </FeatureWindow>
          }
        >
          <p>
            <LeadIn>Your AI counsel, organized the way a legal team is.</LeadIn>
            {" "}legalOS arranges its agents into departments spanning deal work,
            regulatory and compliance, specialized practice areas, and
            operations, each holding its agents in four clearly marked tiers:
            Approved agents your department has vetted and tested; agents powered
            by legalOS that ship free and you copy to make your own; a curated
            library of Anthropic’s Claude for Legal agents, imported and governed
            inside legalOS; and My agents, the ones your own people create. A new
            user reads the trust model at a glance, and access follows roles, so
            each person sees the departments that are theirs.
          </p>
          <p>
            <LeadIn>General Tools, the built-ins that ship free.</LeadIn>{" "}Every
            legalOS comes with a set of general-purpose agents ready to use and
            yours to copy: a summarizer, a clause and term extractor, an
            obligations reviewer, a plain-language rewriter, and more. The first
            one we built, and the one that proves the idea behind the rest, is
            Document Comparison: give it an original and a revised document and it
            returns a plain-language explanation of what changed and a visual
            redline marking every edit in place. Its changes are found by
            deterministic code, not guessed by a model, so it cannot miss a
            change or invent one. It is the first of a deterministic core where
            the part that has to be right is not left to a model’s judgment.
          </p>
        </FeatureRow>

        <FeatureRow
          id="knowledge"
          title="Knowledge"
          visual={
            <FeatureWindow
              active="knowledge-sq"
              crumbs={["Knowledge", "Structured Query"]}
            >
              <KnowledgeSurface compact />
            </FeatureWindow>
          }
        >
          <p>
            <LeadIn>Knowledge management without moving your knowledge.</LeadIn>
            {" "}Your documents already live across the drives your team uses,
            and legalOS leaves them there. It reads them where they live, so your
            files stay a{" "}
            <LeadIn>single source of truth</LeadIn>: legalOS always works from
            the current version, which keeps{" "}
            <LeadIn>version control</LeadIn>{" "}intact and means no one is ever
            reasoning from a copy that has drifted out of sync. Point it at the
            folders you already use, then ask. Your files never move and their
            contents are never stored, only a metadata inventory. There are two
            ways to ask.
          </p>
          <p>
            <LeadIn>Research, for questions that need judgment.</LeadIn>{" "}
            Research reads and reasons (non-deterministic: it weighs and
            interprets like a careful analyst). Ask across the folders you
            choose and get a clear answer backed by citations, and for each
            document it draws on it shows you the exact line it used, so you can
            check the answer against the source yourself.
          </p>
          <p>
            <LeadIn>Structured Query, for questions that need a count.</LeadIn>
            {" "}Structured Query answers exactly (deterministic: the same
            question always returns the same precise, repeatable result). Ask in
            plain language, like how many agreements expire in 2026 or how many
            auto-renew, and get a precise count you can check, with a supporting
            quote from each matching document. And when you ask about something
            not tracked yet, it says so and lets you suggest it, then an
            administrator reviews and approves the new field before it becomes
            permanently queryable.
          </p>
        </FeatureRow>

        <FeatureRow
          id="workflows"
          title="Workflows"
          windowLeft
          visual={
            <FeatureWindow
              active="workflows"
              crumbs={["Workflows", "Review an inbound NDA"]}
            >
              <WorkflowsSurface />
            </FeatureWindow>
          }
        >
          <p>
            <LeadIn>
              Multi-step legal work, built without code and run under human
              approval.
            </LeadIn>{" "}A workflow chains agents into a repeatable process: you
            assemble it in a no-code builder, start from a template or from
            scratch, and run it supervised or autonomously. Either way, any step
            that would change something outside legalOS pauses for a person to
            approve before it acts. Every run keeps a complete step-by-step
            record of what ran, what was approved, and by whom. Some workflows
            run themselves: adopt a watcher, like the renewal watcher that scans
            your agreements for upcoming expirations, and it runs on the
            schedule you set, owned by the person who adopted it, under the same
            approval rules as any other run.
          </p>
        </FeatureRow>

        <FeatureRow
          id="governance"
          title="Admin and governance"
          visual={
            <FeatureWindow rail="admin" active="admin" crumbs={["Admin"]}>
              <AdminSurface />
            </FeatureWindow>
          }
        >
          <p>
            <LeadIn>The control surface that makes the rest safe to use.</LeadIn>
            {" "}Administration in legalOS splits into two halves, the same two
            you see in the product: govern who can do what, and measure what it
            is worth.
          </p>
          <p>
            <LeadIn>Govern.</LeadIn>{" "}<LeadIn>People</LeadIn>{" "}are managed
            with least-privilege roles, invitations, and reversible
            deactivation. <LeadIn>Policy and access</LeadIn>{" "}sets what the
            organization allows: which kinds of connections are permitted, which
            model new agents start with, whether agents act read-only or
            read-and-write, and how many documents a single research run may
            read. This is also where connections live: legalOS works with the
            systems your team already uses, from a pre-vetted catalog covering
            contract lifecycle, document management, e-discovery, court data, and
            the productivity tools around them. Google Workspace is verified end
            to end today; the rest of the catalog is pre-vetted and verified as
            each customer enables it. Connections reach only official
            first-party servers or servers your own organization hosts, and
            reading is open while any action that would change something is built
            to pause for a person to approve. The{" "}
            <LeadIn>Audit log</LeadIn>{" "}records privileged actions like role
            changes and deactivations for administrators to read.
          </p>
          <p>
            <LeadIn>Measure.</LeadIn>{" "}<LeadIn>Insights</LeadIn>{" "}show how
            the organization is adopting legalOS, who is active and how usage is
            trending, all from real, measured usage.{" "}
            <LeadIn>Productivity</LeadIn>{" "}estimates the time and cost legalOS
            saves, combining that measured usage with assumptions you control
            like salary and time saved per task. Usage is measured; the return is
            an estimate you shape, and legalOS labels which is which wherever it
            shows a number. <LeadIn>Evals (coming soon)</LeadIn>{" "}will be how
            you check that outputs meet your standard.
          </p>
        </FeatureRow>
      </div>

      {/* The close and back link share the header's spine: the same 200px
          left shift at ≥1181px, measure preserved, so they align with the
          FeatureRow band above rather than sitting inset in the reading column. */}
      <div className="min-[1181px]:-ml-[200px] min-[1181px]:max-w-[736px]">
        <MarketingSection id="control" title="Control on your terms">
          <p>
            <LeadIn>
              legalOS shapes itself to how your team already operates, not the
              other way around.
            </LeadIn>{" "}It reaches the systems you already run, connecting to
            official first-party servers or to ones your own organization hosts.
            It is model-agnostic by design: use the AI managed through legalOS,
            or bring your own model-provider account and run the work under your
            own agreement and data boundary, so you hold the choice of model and
            your exposure to its cost. And a person with the expertise stays in
            command of the work: across every autonomy mode, anything that would
            change something outside legalOS waits for a human to approve. The
            model is a connection you control, the privacy of your work stays
            yours, and the expert keeps the final say.
          </p>
        </MarketingSection>

        <MarketingClosing>
          Everything above is shipped capability, except where it is marked
          coming soon. For the deeper security story, start with the{" "}
          <MarketingProseLink href="/trust">Trust Center</MarketingProseLink>;
          when you want to see it for yourself,{" "}
          <MarketingProseLink href="/contact">get in touch</MarketingProseLink>.
        </MarketingClosing>
      </div>
    </MarketingPageShell>
  );
}
