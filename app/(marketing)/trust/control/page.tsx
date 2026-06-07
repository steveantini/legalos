import type { Metadata } from "next";

import {
  MarketingClosing,
  MarketingPageShell,
  MarketingSection,
} from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "Control and accountability",
  description:
    "AI in legalOS does not act on its own: reading is open, but any action that changes a connected system pauses for a person to approve it, even in autonomous workflows, and every step is recorded.",
};

/**
 * Trust sub-page: control and accountability in depth (D-129). DERIVED
 * FROM docs/SECURITY_ARCHITECTURE.md and the verified workflow/audit
 * facts (migrations 0048/0049, 0060-0062). The two audit registers are
 * deliberately distinct and must stay that way: the workflow step
 * history is DESIGNED as an immutable record (not policy-enforced;
 * never say "tamper-proof"), while the people-audit trail is genuinely
 * append-only at the database layer (trigger-written, no user path).
 */
export default function TrustControlPage() {
  return (
    <MarketingPageShell
      label="Trust · Control and accountability"
      title="Control and accountability"
      lead="AI in legalOS does not act on its own. An agent can read and reason freely, but it cannot take an action that changes anything without a person approving that specific action first. This page describes how that holds, and how every action is recorded."
      backHref="/trust"
      backLabel="← Back to the Trust Center"
    >
      <MarketingSection title="Reading is open, acting requires approval">
        <p>
          legalOS draws a hard line between reading and acting. An agent can
          read information and reason over it as much as the work requires.
          But any action that would change something outside legalOS, such
          as sending an email, creating a document, or modifying a connected
          system, pauses and waits for a person to approve that exact action
          before it runs. The classification is deliberately cautious: an
          action is treated as read-only only when the connected system
          affirmatively says so, and anything ambiguous is treated as a
          change that needs approval.
        </p>
      </MarketingSection>

      <MarketingSection title="This holds even when a workflow runs on its own">
        <p>
          A workflow can be set to run with more or less human involvement.
          Even at its most autonomous, where it can move through review
          steps on its own, any action that changes a connected system still
          pauses for a person. There is no mode in which legalOS performs an
          unattended change on your behalf. When you approve an action, it
          runs once and only once.
        </p>
      </MarketingSection>

      <MarketingSection title="A record of what happened">
        <p>
          Every step a workflow takes is recorded in order: what ran, what
          information it used, what it produced, when, and whether a person
          approved it or it proceeded automatically. Each run carries a
          frozen copy of the exact steps it executed, so the record reflects
          what actually ran even if the workflow is edited later, and a
          run’s history survives even if the workflow itself is deleted.
          This step history is designed as an immutable record you can
          review.
        </p>
      </MarketingSection>

      <MarketingSection title="The people-audit trail">
        <p>
          Changes to who has access and what role they hold are recorded at
          the database layer by the same mechanism that enforces the rules.
          These records are append-only: there is no path, in the interface
          or otherwise, for a user to alter or remove them, and they are
          written by the database itself whenever a change happens,
          including a change made directly in the database. The trail cannot
          be sidestepped by the application.
        </p>
      </MarketingSection>

      <MarketingSection title="Administrators govern the boundaries">
        <p>
          Your administrators decide what your organization’s agents can
          use: which AI models are available, which connections exist, and
          what those connections are allowed to reach, with a default that
          leans to read-only until access is deliberately granted. Nothing
          that expands what your agents can do or reach is enabled silently.
        </p>
      </MarketingSection>

      <MarketingClosing>
        You are never asked to take the software’s judgment on faith,
        because the software cannot act without you.
      </MarketingClosing>
    </MarketingPageShell>
  );
}
