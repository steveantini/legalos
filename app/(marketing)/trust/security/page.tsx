import type { Metadata } from "next";

import {
  MarketingPageShell,
  MarketingSection,
} from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "Security posture",
  description:
    "How legalOS protects your data, in concrete terms: database-enforced isolation, encrypted credentials, the trusted-only connection boundary, three-layer enforcement, and invite-only access. Honest about what is still ahead.",
};

/**
 * Trust sub-page: the security posture in depth (D-129). DERIVED FROM
 * docs/SECURITY_ARCHITECTURE.md (claims 1-5, 9, 9a); every claim was
 * verified against the code before publication. When the architecture
 * changes, this page changes in the same effort; never let it drift.
 */
export default function TrustSecurityPage() {
  return (
    <MarketingPageShell
      breadcrumb={{ label: "Trust", href: "/trust" }}
      label="Security posture"
      title="Security posture"
      lead="This page describes how legalOS protects your data, in concrete terms. It is written to match the architecture, not to market it. Where a protection is live today, we say so. Where something is still ahead, we say that too."
      backHref="/trust"
      backLabel="← Back to the Trust Center"
    >
      <MarketingSection title="Isolation by default">
        <p>
          Every record in legalOS belongs to an organization, and one
          organization can never reach another’s data. This is enforced by
          the database itself through row-level security, not by application
          code that could be bypassed. A request for data that isn’t yours
          does not return it, because the database will not serve it.
        </p>
      </MarketingSection>

      <MarketingSection title="How credentials are handled">
        <p>
          Every secret legalOS holds, including connection tokens and any AI
          provider key you bring, is encrypted at rest with AES-256-GCM. The
          table that stores them has row-level security enabled and forced
          with no policies at all, which means it is reachable only by the
          server, never by a user session. The key that decrypts them lives
          only in server environment configuration. Secrets are never placed
          in the AI model’s context, never returned to the browser, and
          never written to logs. When a credential is shown back to you in
          the interface, you see only a masked hint, never the value.
        </p>
      </MarketingSection>

      <MarketingSection title="The trusted-only connection boundary">
        <p>
          This is the centerpiece of legalOS’s security design. legalOS can
          connect only to official first-party servers, sourced from the
          vendor’s own documentation, or to servers your own organization
          hosts. Arbitrary third-party or community servers are not
          connectable. They are not discouraged or flagged; they are simply
          not representable as something legalOS can connect to. The trust
          is computed from the code itself on every check, never stored as a
          setting that could be widened, and your organization’s policy can
          only narrow what is allowed, never expand it. There is no place in
          the interface to add an arbitrary server, because the architecture
          has no concept of one.
        </p>
      </MarketingSection>

      <MarketingSection title="Enforcement in three layers">
        <p>
          Sensitive changes, such as a change to someone’s role or access,
          are checked in three places at once: the interface, the server,
          and the database. The database is the last line of defense. An
          illegitimate change is rejected even if it arrives as direct
          database access, and the organization’s last super administrator
          cannot be removed, so an organization can never be locked out of
          its own governance. A compromised front end is not enough to make
          an illegitimate change.
        </p>
      </MarketingSection>

      <MarketingSection title="Access is invite-only">
        <p>
          There is no public signup. Access is granted by invitation, and
          removing someone’s access takes effect on their very next request.
          Removing access is reversible and destroys nothing, so a mistake
          can be undone without data loss.
        </p>
      </MarketingSection>

      <MarketingSection title="What is still ahead">
        <p>
          We are honest about what is not yet in place. legalOS does not yet
          carry formal security certifications such as SOC 2, and several
          hardening measures, including configured security response headers
          and organization-level rate limiting, are on our roadmap rather
          than live today. We will move each item from this section into the
          one above it as it ships, and not before.
        </p>
      </MarketingSection>
    </MarketingPageShell>
  );
}
