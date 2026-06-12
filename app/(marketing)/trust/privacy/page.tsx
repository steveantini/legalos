import type { Metadata } from "next";

import {
  MarketingPageShell,
  MarketingProseLink,
  MarketingSection,
} from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "Privacy and data handling",
  description:
    "What happens to your data in legalOS: what is stored, where it goes, and who can see it. A plain description of how the system actually works, honest about what is still ahead.",
};

/**
 * Trust sub-page: privacy and data handling in depth (D-129). DERIVED
 * FROM the verified data-handling inventory; carries the two plain
 * disclosures (organization administrators can access the org's work;
 * Vercel receives page-view telemetry) and states the retention and
 * deletion gaps honestly. A descriptive explainer, explicitly NOT the
 * legal privacy policy (that is Tier 3, on the Legal page).
 */
export default function TrustPrivacyPage() {
  return (
    <MarketingPageShell
      breadcrumb={{ label: "Trust", href: "/trust" }}
      label="Privacy and data handling"
      title="Privacy and data handling"
      lead="This page describes, plainly, what happens to your data in legalOS: what is stored, where it goes, and who can see it. It is a description of how the system actually works, not a legal policy document. Our formal privacy terms will live on the Legal page when they are published."
      backHref="/trust"
      backLabel="← Back to the Trust Center"
    >
      <MarketingSection title="What legalOS does and does not do with your data">
        <p>
          Your data is yours. legalOS does not sell it, and legalOS does not
          train any models on it. There is no model training of any kind in
          the product. legalOS stores what the product needs to function:
          your account, your conversations and their results, your agents
          and workflows and the records of their runs, the documents you
          provide, and connection metadata. That data is isolated to your
          organization.
        </p>
      </MarketingSection>

      <MarketingSection title="Where your data goes">
        <p>
          When you send work to an AI model, that request is sent to
          Anthropic for inference, under Anthropic’s commercial terms, which
          you can review. If you bring your own model provider key, the
          request runs under your own account and your own agreement, so the
          data boundary is yours to set. Beyond AI inference, legalOS relies
          on a small set of infrastructure providers: Vercel for hosting,
          Supabase for data storage and authentication, and Anthropic for AI
          inference. When your organization connects Google Workspace,
          Google receives only what a given action requires. Vercel also
          receives basic page-view and performance telemetry, which contains
          no message content.
        </p>
      </MarketingSection>

      <MarketingSection title="Who can see your data">
        <p>
          Within your organization, your administrators can access the
          conversations and work that happen in legalOS, because the work
          product belongs to the organization rather than to any one user.
          This is a deliberate design for a tool that holds an
          organization’s legal work, and we state it plainly rather than
          leave it implied. Across organizations, no one can reach your
          data; that boundary is enforced by the database.
        </p>
      </MarketingSection>

      <MarketingSection title="Retention and deletion, honestly">
        <p>
          This is an area we are still building, and we will not overstate
          it. Today, removing a person’s access is reversible and destroys
          nothing. Deleted agents are held and can be restored within a
          window. legalOS does not yet offer permanent data deletion, full
          account deletion and data export, or a formal published retention
          policy. Administrative and usage records are kept as an ongoing
          record. Formal retention and deletion controls, and readiness for
          privacy regimes such as GDPR and CCPA, are on our roadmap. We will
          describe each here as it becomes real.
        </p>
      </MarketingSection>

      <MarketingSection title="Your data, your boundary">
        <p>
          The direction of legalOS is to put the data boundary increasingly
          in your hands. Bringing your own model already means inference
          runs under your own agreement. As the ability to run your own
          models on your own infrastructure matures, a legal team will be
          able to keep privileged data inside its own environment from end
          to end. You can read more about that direction on our{" "}
          <MarketingProseLink href="/mission">Mission</MarketingProseLink>{" "}
          page.
        </p>
      </MarketingSection>
    </MarketingPageShell>
  );
}
