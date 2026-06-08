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
  title: "Data Processing Agreement",
  description:
    "How legalOS processes personal data on behalf of customer organizations. Draft, for review by counsel before publication.",
};

/**
 * Data Processing Agreement draft (Tier 3, D-135). Reproduced from the
 * operator-approved draft. The security measures (section 4) are live and
 * verified; sections 5 through 9 commit to operational capabilities still
 * being built, each flagged in a distinct reviewer-note callout. Bracketed
 * placeholders are preserved verbatim. Marked draft and not yet effective.
 */
export default function LegalDpaPage() {
  return (
    <MarketingPageShell
      label="Legal · Data Processing Agreement"
      title="Data Processing Agreement"
      backHref="/legal"
      backLabel="← Back to Legal"
    >
      <MarketingDraftBanner>
        For review by counsel before publication. This DPA states the
        commitments legalOS intends to make as a processor; several commitments
        describe operational capabilities that must be in place before this DPA
        is made effective. See the flagged notes.
      </MarketingDraftBanner>

      <p className="mt-5 text-[13px] text-caption">
        Effective date: <MarketingPlaceholder>[Effective date]</MarketingPlaceholder>
      </p>

      <MarketingLegalSection number={1} title="Parties and roles">
        <p>
          This Data Processing Agreement (“DPA”) forms part of the agreement
          between{" "}
          <MarketingPlaceholder>[Legal Entity Name]</MarketingPlaceholder>{" "}
          (“Processor,” “legalOS”) and the customer organization (“Controller,”
          “Customer”). It governs legalOS’s processing of personal data
          contained in Customer Data on Customer’s behalf. Where applicable data
          protection law treats Customer as a controller and legalOS as a
          processor, this DPA applies.
        </p>
      </MarketingLegalSection>

      <MarketingLegalSection number={2} title="Scope and instructions">
        <p>
          legalOS will process personal data only to provide the Service and
          only on Customer’s documented instructions, including as set out in
          the agreement, this DPA, and Customer’s configuration and use of the
          Service. legalOS will not process the personal data for any other
          purpose, and in particular will not sell it or use it to train AI
          models.
        </p>
        <MarketingDraftNote>
          this commitment matches the product today: no training, no sale.
        </MarketingDraftNote>
      </MarketingLegalSection>

      <MarketingLegalSection number={3} title="Confidentiality">
        <p>
          legalOS will ensure that personnel authorized to process the personal
          data are bound by appropriate obligations of confidentiality.
        </p>
        <MarketingDraftNote>
          requires confidentiality obligations to be in place for any personnel
          or contractors before effective.
        </MarketingDraftNote>
      </MarketingLegalSection>

      <MarketingLegalSection number={4} title="Security measures">
        <p>
          legalOS will implement and maintain technical and organizational
          measures appropriate to the risk, including: isolation of each
          organization’s data at the database layer; encryption of credentials
          and secrets at rest; server-side-only handling of secrets and access
          tokens; restriction of connectable systems to vetted first-party
          providers or systems the Customer hosts; human approval for actions
          that change connected systems; least-privilege role controls enforced
          across interface, server, and database; and audit logging of
          privileged actions. A fuller description is maintained in the{" "}
          <MarketingProseLink href="/trust">Trust Center</MarketingProseLink>.
        </p>
        <MarketingDraftNote>
          these measures are live and verified in the architecture. The
          commitments in sections 5 through 9 require operational build before
          effective.
        </MarketingDraftNote>
      </MarketingLegalSection>

      <MarketingLegalSection number={5} title="Subprocessors">
        <p>
          Customer authorizes legalOS to engage the subprocessors listed on the{" "}
          <MarketingProseLink href="/legal/subprocessors">
            Subprocessors
          </MarketingProseLink>{" "}
          page to process personal data in connection with the Service. legalOS
          will impose data protection obligations on each subprocessor
          substantially equivalent to those in this DPA, and will provide a
          mechanism for Customer to be informed of changes to subprocessors and
          to object to a new subprocessor on reasonable grounds.
        </p>
        <MarketingDraftNote>
          a subprocessor-change notification mechanism and the back-to-back
          contractual terms with each subprocessor must be established before
          this clause is effective. Today the subprocessors are disclosed; the
          notification and objection process is to be built.
        </MarketingDraftNote>
      </MarketingLegalSection>

      <MarketingLegalSection number={6} title="Assistance to Controller">
        <p>
          Taking into account the nature of the processing, legalOS will assist
          Customer, by appropriate technical and organizational measures, in
          fulfilling Customer’s obligations to respond to requests from data
          subjects exercising their rights, and in ensuring compliance with
          Customer’s security, breach-notification, impact-assessment, and
          consultation obligations.
        </p>
        <MarketingDraftNote>
          data-subject-request assistance tooling and the impact-assessment
          support process are on the roadmap (item 5); this clause commits to
          that assistance. Ensure the process exists before effective.
        </MarketingDraftNote>
      </MarketingLegalSection>

      <MarketingLegalSection number={7} title="Personal data breach">
        <p>
          legalOS will notify Customer without undue delay after becoming aware
          of a personal data breach affecting Customer’s personal data, and will
          provide information reasonably available to assist Customer in meeting
          its notification obligations.
        </p>
        <MarketingDraftNote>
          this commits legalOS to a breach-detection-and-notification process
          and an internal response procedure; this must be established
          (detection, an internal escalation path, a notification workflow)
          before this DPA is effective. It does not exist as a formal program
          today.
        </MarketingDraftNote>
      </MarketingLegalSection>

      <MarketingLegalSection number={8} title="Deletion and return">
        <p>
          Upon termination of the Service, and at Customer’s choice, legalOS
          will delete or return Customer’s personal data within a reasonable
          period, except to the extent retention is required by law.
        </p>
        <MarketingDraftNote>
          this commits to an operational deletion-and-return capability. Today,
          full permanent deletion is not yet implemented (roadmap item 5); the
          deletion capability must exist before this clause is effective. This
          is the most important operational gap to close for the DPA.
        </MarketingDraftNote>
      </MarketingLegalSection>

      <MarketingLegalSection number={9} title="Audits">
        <p>
          legalOS will make available information reasonably necessary to
          demonstrate compliance with this DPA and will allow for and contribute
          to audits, including inspections, conducted by Customer or an auditor
          it mandates, subject to reasonable confidentiality and security
          conditions.
        </p>
        <MarketingDraftNote>
          as compliance attestations (e.g. SOC 2) are obtained (roadmap item 5),
          they can satisfy much of this; until then, this commits legalOS to
          direct audit cooperation.
        </MarketingDraftNote>
      </MarketingLegalSection>

      <MarketingLegalSection number={10} title="International transfers">
        <p>
          To the extent personal data is transferred across borders, the parties
          will rely on a lawful transfer mechanism.{" "}
          <MarketingPlaceholder>
            [Specific mechanism, e.g. Standard Contractual Clauses, to be
            incorporated.]
          </MarketingPlaceholder>
        </p>
        <MarketingDraftNote>
          depends on data-hosting locations; placeholder pending confirmation
          and counsel selection of the mechanism.
        </MarketingDraftNote>
      </MarketingLegalSection>

      <MarketingLegalSection number={11} title="Details of processing">
        <p>
          <MarketingPlaceholder>
            [Subject matter, duration, nature and purpose of processing, types
            of personal data, and categories of data subjects to be set out in
            an annex. Standard DPA annex, to be completed with counsel.]
          </MarketingPlaceholder>
        </p>
      </MarketingLegalSection>

      <MarketingLegalSection
        number={12}
        title="Order of precedence; governing law"
      >
        <p>
          In case of conflict, this DPA prevails over the agreement with respect
          to processing of personal data. This DPA is governed by{" "}
          <MarketingPlaceholder>[Governing jurisdiction]</MarketingPlaceholder>.
        </p>
      </MarketingLegalSection>
    </MarketingPageShell>
  );
}
