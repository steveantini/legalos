import type { Metadata } from "next";

import { MarketingComingSoon } from "@/components/marketing/marketing-coming-soon";

export const metadata: Metadata = {
  title: "Contact",
};

export default function ContactPage() {
  return (
    <MarketingComingSoon
      label="Contact"
      description="Get in touch about legalOS — demos, partnerships, press, or just a question. A direct contact channel is on the way."
    />
  );
}
