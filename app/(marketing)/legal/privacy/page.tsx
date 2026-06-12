import type { Metadata } from "next";

import {
  MarketingDraftBanner,
  MarketingDraftNote,
  MarketingLegalSection,
  MarketingPageShell,
  MarketingPlaceholder,
  MarketingProseLink,
} from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What data legalOS collects, how it is used, and your choices. Draft, for review by counsel before publication.",
};

/**
 * Privacy Policy draft (Tier 3, D-135). Reproduced from the operator-approved
 * draft. Factual sections are written true to the verified data-handling
 * inventory; bracketed placeholders are preserved verbatim, and every
 * "[Draft note: ...]" is rendered as a distinct reviewer-note callout. Marked
 * draft and not yet effective.
 */
export default function LegalPrivacyPage() {
  return (
    <MarketingPageShell
      breadcrumb={{ label: "Legal", href: "/legal" }}
      label="Privacy Policy"
      title="Privacy Policy"
      backHref="/legal"
      backLabel="← Back to Legal"
    >
      <MarketingDraftBanner>
        For review by counsel before publication.
      </MarketingDraftBanner>

      <p className="mt-5 text-[13px] text-caption">
        Effective date: <MarketingPlaceholder>[Effective date]</MarketingPlaceholder>
      </p>

      <MarketingLegalSection number={1} title="Scope">
        <p>
          This Privacy Policy explains how{" "}
          <MarketingPlaceholder>[Legal Entity Name]</MarketingPlaceholder>{" "}
          (“legalOS,” “we”) handles personal data in connection with the
          legalOS service. For personal data that legalOS processes on behalf of
          a customer organization (its users’ and its own data within the
          workspace), legalOS acts as a processor and the customer as
          controller; that processing is governed by the{" "}
          <MarketingProseLink href="/legal/dpa">
            Data Processing Agreement
          </MarketingProseLink>
          . This Policy describes legalOS’s own practices and is written to
          reflect how the product actually works.
        </p>
      </MarketingLegalSection>

      <MarketingLegalSection number={2} title="Data we collect">
        <p>
          legalOS collects and stores: account and organization data (the email
          address, name, and role of users, and organization and department
          information); workspace content (conversations and their results,
          agents and their instructions, workflows and the records of their
          runs, and documents and files that users provide); connection data
          (metadata about the third-party systems an organization connects, and
          encrypted credentials for those connections); and usage and
          operational data (records of usage such as message counts, token
          usage, and cost, and administrative audit records of privileged
          actions).
        </p>
      </MarketingLegalSection>

      <MarketingLegalSection number={3} title="How we use data">
        <p>
          legalOS uses this data to provide, secure, and support the Service: to
          operate the workspace, to route requests to AI models for inference at
          the user’s direction, to enforce access and governance controls, to
          maintain audit records, and to understand and improve reliability and
          usage. legalOS does not sell personal data, and legalOS does not use
          customer content to train artificial intelligence models.
        </p>
      </MarketingLegalSection>

      <MarketingLegalSection number={4} title="AI inference">
        <p>
          When a user sends work to an AI model, the request is transmitted to
          the model provider for processing. legalOS currently uses Anthropic
          for AI inference, and that processing is subject to Anthropic’s
          applicable terms. Where a customer organization brings its own model
          provider credentials, the request is processed under that
          organization’s own account and agreement with the provider.
        </p>
      </MarketingLegalSection>

      <MarketingLegalSection number={5} title="Who can access data">
        <p>
          Within an organization, that organization’s administrators can access
          the conversations and work created in the organization’s workspace,
          because the work product belongs to the organization rather than to an
          individual user. Across organizations, data is isolated, and one
          organization cannot access another’s data. legalOS personnel access
          organization data only as needed to operate, secure, or support the
          Service, or as required by law.
        </p>
        <MarketingDraftNote>
          “personnel access only as needed” is a commitment; ensure internal
          access controls and logging back this before effective. Today the
          platform-owner cross-tenant capability exists as an access path;
          confirm it is governed and logged consistent with this statement.
        </MarketingDraftNote>
      </MarketingLegalSection>

      <MarketingLegalSection number={6} title="Third parties and subprocessors">
        <p>
          legalOS relies on a limited set of infrastructure and service
          providers to operate, including hosting, data storage and
          authentication, and AI inference. These are listed on the{" "}
          <MarketingProseLink href="/legal/subprocessors">
            Subprocessors
          </MarketingProseLink>{" "}
          page. Basic page-view and performance telemetry, which does not
          include workspace content, is collected through our hosting provider.
        </p>
      </MarketingLegalSection>

      <MarketingLegalSection number={7} title="Security">
        <p>
          legalOS protects data with technical and organizational measures,
          including database-level isolation between organizations, encryption
          of credentials at rest, server-side-only handling of secrets, a
          restricted set of trusted connectable systems, and human approval for
          actions that change connected systems. These measures are described in
          more detail in the{" "}
          <MarketingProseLink href="/trust">Trust Center</MarketingProseLink>.
        </p>
      </MarketingLegalSection>

      <MarketingLegalSection number={8} title="Data retention and deletion">
        <p>
          legalOS retains data for as long as needed to provide the Service and
          as described in the{" "}
          <MarketingProseLink href="/legal/dpa">
            Data Processing Agreement
          </MarketingProseLink>{" "}
          and applicable order. We are candid that some data controls are still
          being built: today, access can be deactivated reversibly, and certain
          items can be restored within a window before removal, but full
          self-service permanent deletion, account deletion, and data export are
          not yet available and are on our roadmap. Administrative and usage
          records are retained as an ongoing record.
        </p>
        <MarketingDraftNote>
          this section is written truthfully to the current state. As
          deletion/export capabilities ship (roadmap item 5), update this
          section to describe them. Do not represent a right-to-erasure
          mechanism as available until it is built.
        </MarketingDraftNote>
      </MarketingLegalSection>

      <MarketingLegalSection number={9} title="Your choices and rights">
        <p>
          Depending on applicable law, individuals may have rights to access,
          correct, or delete personal data, or to object to or restrict
          processing. Because legalOS typically processes personal data on
          behalf of a customer organization, such requests are usually directed
          to and handled by that organization as controller; legalOS will assist
          its customers in responding as described in the{" "}
          <MarketingProseLink href="/legal/dpa">
            Data Processing Agreement
          </MarketingProseLink>
          .
        </p>
        <MarketingDraftNote>
          legalOS’s readiness to action data-subject requests (and GDPR/CCPA-
          specific rights) is on the roadmap; this section commits to assisting
          customers. Ensure a request-handling process exists before relying on
          it.
        </MarketingDraftNote>
      </MarketingLegalSection>

      <MarketingLegalSection number={10} title="International data">
        <p>
          <MarketingPlaceholder>
            [Data location and any cross-border transfer mechanisms to be
            confirmed.]
          </MarketingPlaceholder>
        </p>
        <MarketingDraftNote>
          hosting/storage locations and transfer mechanisms (e.g. SCCs) require
          confirmation of where Vercel and Supabase host the data; placeholder
          pending that confirmation.
        </MarketingDraftNote>
      </MarketingLegalSection>

      <MarketingLegalSection number={11} title="Children">
        <p>
          The Service is not directed to individuals under 18 and is intended
          for use by legal professionals.
        </p>
      </MarketingLegalSection>

      <MarketingLegalSection number={12} title="Changes">
        <p>
          legalOS may update this Policy and will communicate material changes
          through the Service or by other reasonable means.
        </p>
      </MarketingLegalSection>

      <MarketingLegalSection number={13} title="Contact">
        <p>
          Privacy questions or requests:{" "}
          <MarketingPlaceholder>[Legal/privacy contact]</MarketingPlaceholder>.
        </p>
      </MarketingLegalSection>
    </MarketingPageShell>
  );
}
