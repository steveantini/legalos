import type { Metadata } from "next";
import Link from "next/link";

import {
  MarketingClosing,
  MarketingPageShell,
  MarketingProseLink,
} from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "Legal",
  description:
    "The agreements and policies that govern legalOS: Terms of Service, Privacy Policy, Data Processing Agreement, and Subprocessors. Provided in draft.",
};

/**
 * Legal hub (Tier 3, D-135). Mirrors the Trust hub structure: a short
 * introduction and links to the four document sub-pages, each carrying its
 * own prominent draft banner. The documents are drafts grounded in the
 * verified data-handling inventory; commitments that depend on a capability
 * still being built are flagged in reviewer notes on the document pages, not
 * overstated here.
 */

interface LegalDoc {
  title: string;
  description: string;
  href: string;
}

const DOCS: LegalDoc[] = [
  {
    title: "Terms of Service",
    description: "The agreement governing use of legalOS.",
    href: "/legal/terms",
  },
  {
    title: "Privacy Policy",
    description: "What data legalOS collects, how it is used, and your choices.",
    href: "/legal/privacy",
  },
  {
    title: "Data Processing Agreement",
    description:
      "How legalOS processes personal data on behalf of customer organizations.",
    href: "/legal/dpa",
  },
  {
    title: "Subprocessors",
    description: "The third parties that support legalOS.",
    href: "/legal/subprocessors",
  },
];

export default function LegalPage() {
  return (
    <MarketingPageShell
      label="Company · Legal"
      title="Legal"
      lead="The agreements and policies that govern legalOS. These documents are being finalized and are provided here in draft."
    >
      <p className="mt-6 text-[15px] leading-[1.75] text-ink-2">
        This page links to the terms under which legalOS is offered, how data
        is handled, and the commitments legalOS makes to the organizations that
        use it.
      </p>

      <p className="mt-4 text-[13.5px] leading-[1.6] text-muted-foreground">
        Each document below is a draft, provided for review and not yet
        effective.
      </p>

      <div className="mt-8 space-y-6 border-t border-hairline pt-8">
        {DOCS.map((doc) => (
          <div key={doc.href}>
            <Link
              href={doc.href}
              className="inline-flex items-baseline gap-1.5 text-[18px] font-semibold tracking-tight text-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {doc.title}
              <span aria-hidden className="text-primary">
                →
              </span>
            </Link>
            <p className="mt-1 text-[14px] leading-[1.6] text-muted-foreground">
              {doc.description}
            </p>
          </div>
        ))}
      </div>

      <MarketingClosing>
        For how these commitments are reflected in the product’s architecture,
        see the{" "}
        <MarketingProseLink href="/trust">Trust Center</MarketingProseLink>.
      </MarketingClosing>
    </MarketingPageShell>
  );
}
