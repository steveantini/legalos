import type { Metadata } from "next";

import {
  MarketingDraftBanner,
  MarketingDraftNote,
  MarketingPageShell,
  MarketingPlaceholder,
  MarketingProseLink,
} from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "Subprocessors",
  description:
    "The third parties that may process data in connection with legalOS. Draft, for review by counsel before publication.",
};

interface SubprocessorRow {
  name: string;
  purpose: string;
  data: string;
}

const SUBPROCESSORS: SubprocessorRow[] = [
  {
    name: "Vercel",
    purpose: "Application hosting and delivery; page-view and performance telemetry.",
    data: "Application requests; basic usage and performance telemetry, no workspace content.",
  },
  {
    name: "Supabase",
    purpose: "Database, authentication, and file storage.",
    data: "All stored workspace and account data.",
  },
  {
    name: "Anthropic",
    purpose: "AI model inference.",
    data: "Content submitted to AI models at a user’s direction.",
  },
  {
    name: "Google",
    purpose:
      "Google Workspace connections, only when a Customer connects Google services.",
    data: "Data exchanged with the Customer’s connected Google Drive, Gmail, or Calendar, as directed.",
  },
];

/**
 * Subprocessors draft (Tier 3, D-135). Lists the third parties that may
 * process data in connection with legalOS. The list is true to the verified
 * data-handling inventory; the change-notification mechanism and the email
 * provider are flagged in reviewer notes. Marked draft and not yet effective.
 */
export default function LegalSubprocessorsPage() {
  return (
    <MarketingPageShell
      breadcrumb={{ label: "Legal", href: "/legal" }}
      label="Subprocessors"
      title="Subprocessors"
      backHref="/legal"
      backLabel="← Back to Legal"
    >
      <MarketingDraftBanner>
        For review by counsel before publication.
      </MarketingDraftBanner>

      <p className="mt-5 text-[13px] text-caption">
        Effective date: <MarketingPlaceholder>[Effective date]</MarketingPlaceholder>
      </p>

      <p className="mt-6 text-[15px] leading-[1.75] text-ink-2">
        legalOS relies on a small number of trusted providers to operate the
        Service. This page lists the subprocessors that may process data in
        connection with legalOS, and we update it as the list changes.
      </p>

      <div className="mt-8 overflow-x-auto border-t border-hairline pt-2">
        <table className="w-full border-collapse text-left text-[14px] leading-[1.6]">
          <thead>
            <tr className="border-b border-hairline-strong">
              <th className="py-2.5 pr-4 align-bottom font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-caption">
                Subprocessor
              </th>
              <th className="py-2.5 pr-4 align-bottom font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-caption">
                Purpose
              </th>
              <th className="py-2.5 align-bottom font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-caption">
                Data processed
              </th>
            </tr>
          </thead>
          <tbody className="text-ink-2">
            {SUBPROCESSORS.map((row) => (
              <tr
                key={row.name}
                className="border-b border-hairline align-top last:border-b-0"
              >
                <td className="py-3 pr-4 font-medium text-foreground">
                  {row.name}
                </td>
                <td className="py-3 pr-4">{row.purpose}</td>
                <td className="py-3">{row.data}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <MarketingDraftNote>
        the email/SMTP provider for sign-in and invitation messages should be
        added here once confirmed; it was not determinable from the codebase and
        is currently unverified.
      </MarketingDraftNote>

      <section className="mt-8 border-t border-hairline pt-6">
        <h2 className="text-[17px] font-semibold leading-snug tracking-tight text-foreground">
          Note on customer-provided AI
        </h2>
        <p className="mt-3 text-[15px] leading-[1.75] text-ink-2">
          Where a Customer brings its own AI model provider credentials, that
          provider processes the Customer’s content under the Customer’s own
          account and agreement, and is not a legalOS subprocessor.
        </p>
      </section>

      <section className="mt-8 border-t border-hairline pt-6">
        <h2 className="text-[17px] font-semibold leading-snug tracking-tight text-foreground">
          Changes
        </h2>
        <div className="mt-3 space-y-3 text-[15px] leading-[1.75] text-ink-2">
          <p>
            legalOS will maintain this list and, under the{" "}
            <MarketingProseLink href="/legal/dpa">
              Data Processing Agreement
            </MarketingProseLink>
            , provide a means for customers to be informed of changes.
          </p>
          <MarketingDraftNote>
            the change-notification mechanism is committed in the DPA and is to
            be built.
          </MarketingDraftNote>
        </div>
      </section>
    </MarketingPageShell>
  );
}
