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
  title: "Terms of Service",
  description:
    "The agreement governing use of legalOS. Draft, for review by counsel before publication.",
};

/**
 * Terms of Service draft (Tier 3, D-135). Reproduced from the operator-approved
 * draft. Bracketed placeholders are preserved verbatim (no invented values);
 * every "[Draft note: ...]" is rendered as a distinct reviewer-note callout,
 * not body text. Marked draft and not yet effective.
 */
export default function LegalTermsPage() {
  return (
    <MarketingPageShell
      breadcrumb={{ label: "Legal", href: "/legal" }}
      label="Terms of Service"
      title="Terms of Service"
      backHref="/legal"
      backLabel="← Back to Legal"
    >
      <MarketingDraftBanner>
        For review by counsel before publication.
      </MarketingDraftBanner>

      <p className="mt-5 text-[13px] text-caption">
        Effective date: <MarketingPlaceholder>[Effective date]</MarketingPlaceholder>
      </p>

      <MarketingLegalSection number={1} title="Agreement">
        <p>
          These Terms of Service (“Terms”) govern access to and use of legalOS,
          the connected workspace and legal department operating system
          (“Service”), provided by{" "}
          <MarketingPlaceholder>[Legal Entity Name]</MarketingPlaceholder>{" "}
          (“legalOS,” “we,” “us”). By accessing or using the Service, the
          organization on whose behalf you act (“Customer,” “you”) agrees to
          these Terms. If you are accepting on behalf of an organization, you
          represent that you have authority to bind that organization.
        </p>
      </MarketingLegalSection>

      <MarketingLegalSection number={2} title="The Service">
        <p>
          legalOS provides a workspace in which Customer’s authorized users can
          use AI agents, build and run workflows, and connect third-party
          systems, subject to the governance controls described in the
          documentation and the{" "}
          <MarketingProseLink href="/trust">Trust Center</MarketingProseLink>.
          The Service is offered on an invitation basis and may change as it
          develops.
        </p>
      </MarketingLegalSection>

      <MarketingLegalSection number={3} title="Accounts and access">
        <p>
          Access is granted by invitation and is limited to authorized users.
          Customer is responsible for its users’ access, for maintaining the
          confidentiality of access credentials, and for all activity under its
          account. Customer’s administrators control roles, connections, and the
          capabilities available within Customer’s organization.
        </p>
      </MarketingLegalSection>

      <MarketingLegalSection number={4} title="Customer data and content">
        <p>
          As between the parties, Customer owns all data, documents,
          instructions, and content it or its users submit to the Service
          (“Customer Data”). Customer grants legalOS a limited license to host,
          process, and transmit Customer Data solely to provide and support the
          Service. legalOS does not sell Customer Data and does not use Customer
          Data to train artificial intelligence models. Processing of personal
          data within Customer Data is governed by the{" "}
          <MarketingProseLink href="/legal/dpa">
            Data Processing Agreement
          </MarketingProseLink>
          .
        </p>
      </MarketingLegalSection>

      <MarketingLegalSection number={5} title="AI features; no professional advice">
        <p>
          The Service uses third-party AI models to generate output at
          Customer’s direction. AI output may be inaccurate or incomplete and
          must be reviewed by a qualified person before it is relied upon. The
          Service is a tool for legal professionals and does not itself provide
          legal advice, does not create an attorney-client relationship, and is
          not a substitute for professional judgment. Customer is solely
          responsible for its use of any output.
        </p>
        <MarketingDraftNote>
          this professional-responsibility framing is important for a
          legal-sector product; counsel should confirm wording against
          applicable rules of professional conduct.
        </MarketingDraftNote>
      </MarketingLegalSection>

      <MarketingLegalSection number={6} title="Acceptable use">
        <p>
          Customer will not: use the Service in violation of law; attempt to
          circumvent the Service’s security, access controls, or governance;
          reverse engineer the Service except as permitted by law; use the
          Service to build a competing product; or use the Service to store or
          process content it has no right to process. legalOS may suspend access
          to address a material risk to the Service or other customers, with
          notice where practicable.
        </p>
      </MarketingLegalSection>

      <MarketingLegalSection number={7} title="Third-party connections">
        <p>
          The Service can connect to third-party systems (for example, Google
          Workspace) and to AI model providers at Customer’s direction.
          Customer’s use of those third parties is governed by Customer’s
          agreements with them. legalOS is not responsible for third-party
          services, and any action the Service takes within a connected system
          is taken at Customer’s direction and, for actions that change a
          connected system, only upon a person’s approval.
        </p>
      </MarketingLegalSection>

      <MarketingLegalSection number={8} title="Fees">
        <p>Fees, if any, will be as agreed between the parties.</p>
        <MarketingDraftNote>
          pricing/billing terms are not yet defined pending the business-model
          decision; this section is a placeholder to be completed when pricing
          is set.
        </MarketingDraftNote>
      </MarketingLegalSection>

      <MarketingLegalSection number={9} title="Confidentiality">
        <p>
          Each party will protect the other’s confidential information with
          reasonable care and use it only to perform under these Terms.
        </p>
      </MarketingLegalSection>

      <MarketingLegalSection number={10} title="Warranties and disclaimers">
        <p>
          legalOS will provide the Service with reasonable skill and care.
          Except as expressly stated, the Service is provided “as is,” and
          legalOS disclaims all other warranties to the fullest extent permitted
          by law, including merchantability, fitness for a particular purpose,
          and non-infringement. legalOS does not warrant that AI output will be
          accurate or that the Service will be uninterrupted or error-free.
        </p>
        <MarketingDraftNote>
          standard disclaimer; counsel to align with the liability section and
          applicable law.
        </MarketingDraftNote>
      </MarketingLegalSection>

      <MarketingLegalSection number={11} title="Limitation of liability">
        <p>
          To the fullest extent permitted by law, neither party will be liable
          for indirect, incidental, special, consequential, or punitive
          damages, and each party’s aggregate liability arising out of the
          Service will be limited to{" "}
          <MarketingPlaceholder>
            [limitation amount / fees paid in the preceding 12 months]
          </MarketingPlaceholder>
          .
        </p>
        <MarketingDraftNote>
          the cap and any carve-outs (e.g. for confidentiality breach,
          indemnities) require counsel input and tie to the pricing model.
        </MarketingDraftNote>
      </MarketingLegalSection>

      <MarketingLegalSection number={12} title="Indemnification">
        <p>
          <MarketingPlaceholder>
            [Mutual or one-way indemnification terms to be set by counsel.]
          </MarketingPlaceholder>
        </p>
        <MarketingDraftNote>
          indemnity scope is a negotiated, counsel-driven term; flagged as a
          placeholder rather than drafted speculatively.
        </MarketingDraftNote>
      </MarketingLegalSection>

      <MarketingLegalSection number={13} title="Term and termination">
        <p>
          These Terms apply while Customer uses the Service. Either party may
          terminate as provided in the applicable order or, absent an order, on
          notice. Upon termination, Customer’s access ends and Customer Data is
          handled as described in the{" "}
          <MarketingProseLink href="/legal/privacy">
            Privacy Policy
          </MarketingProseLink>{" "}
          and the{" "}
          <MarketingProseLink href="/legal/dpa">
            Data Processing Agreement
          </MarketingProseLink>
          .
        </p>
        <MarketingDraftNote>
          deletion-on-termination is committed in the DPA; ensure the
          operational deletion capability exists before this is made effective.
          See the DPA flag.
        </MarketingDraftNote>
      </MarketingLegalSection>

      <MarketingLegalSection number={14} title="Changes to the Service and these Terms">
        <p>
          legalOS may update the Service and these Terms. Material changes will
          be communicated through the Service or by other reasonable means, and
          continued use after changes take effect constitutes acceptance.
        </p>
      </MarketingLegalSection>

      <MarketingLegalSection number={15} title="Governing law">
        <p>
          These Terms are governed by the laws of{" "}
          <MarketingPlaceholder>[Governing jurisdiction]</MarketingPlaceholder>,
          without regard to conflict-of-laws principles.
        </p>
        <MarketingDraftNote>
          jurisdiction to be determined; operator is in North Carolina, but the
          contracting entity’s home jurisdiction governs this choice.
        </MarketingDraftNote>
      </MarketingLegalSection>

      <MarketingLegalSection number={16} title="Contact">
        <p>
          Questions about these Terms:{" "}
          <MarketingPlaceholder>[Legal/notice contact]</MarketingPlaceholder>.
        </p>
      </MarketingLegalSection>
    </MarketingPageShell>
  );
}
