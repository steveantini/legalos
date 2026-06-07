import type { Metadata } from "next";

import {
  MarketingClosing,
  MarketingPageShell,
} from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "A direct contact channel for legalOS, for demos, partnerships, and press, is on the way.",
};

/**
 * Honest coming-soon-lite (Tier 1b): no email address and no form until
 * a real contact channel exists. The request-access option on the home
 * page is the interim route in.
 */
export default function ContactPage() {
  return (
    <MarketingPageShell
      label="Company · Contact"
      title="Contact"
      lead="A direct contact channel is on the way."
    >
      <p className="mt-8 text-[15px] leading-[1.75] text-ink-2">
        legalOS is early, and invite-only for now. A proper way to reach us,
        for demos, partnerships, and press, is coming soon and will live
        here. In the meantime, the request access option on the home page is
        the way to be in touch.
      </p>

      <MarketingClosing>Thank you for your interest in legalOS.</MarketingClosing>
    </MarketingPageShell>
  );
}
