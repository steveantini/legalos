import type { Metadata } from "next";

import {
  MarketingPageShell,
  MarketingProseLink,
} from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Common questions about legalOS: what it is, who it is for, how data is handled, which AI models it uses, and how to get access.",
};

/**
 * Question-and-answer pairs rendered as a plain, readable list (no
 * disclosure widgets: seven short answers read better fully visible,
 * and the page stays a zero-JS server component).
 */
const FAQ_ITEMS: { question: string; answer: React.ReactNode }[] = [
  {
    question: "What is legalOS?",
    answer: (
      <p>
        legalOS is a connected workspace and operating system for legal
        teams. It brings AI agents, workflows, and the tools your team uses
        into one governed place, built around how legal work actually
        happens.
      </p>
    ),
  },
  {
    question: "Who is it for?",
    answer: (
      <p>
        In-house legal departments and law firms. The product treats both as
        first-class. The shared need is to do serious legal work with AI
        while keeping control of it.
      </p>
    ),
  },
  {
    question: "How is my data handled?",
    answer: (
      <p>
        Your data is yours. legalOS does not sell it and does not train any
        models on it. You can read the full picture, including how AI
        inference works and what your administrators can access, on our{" "}
        <MarketingProseLink href="/trust">Trust</MarketingProseLink> page.
      </p>
    ),
  },
  {
    question: "What AI models does it use?",
    answer: (
      <p>
        Today, AI inference is performed through Anthropic’s API under
        Anthropic’s commercial terms. legalOS is built to be model-agnostic,
        and you can connect your own model provider account so the work runs
        under your own agreement.
      </p>
    ),
  },
  {
    question: "Can I use my own model?",
    answer: (
      <p>
        Yes. You can bring your own provider key, in which case requests run
        under your own account and your own data boundary. Running your own
        self-hosted model is part of where the product is headed.
      </p>
    ),
  },
  {
    question: "Is it secure?",
    answer: (
      <p>
        Security was built into the architecture from the start, not added
        later. Records are isolated per organization at the database level,
        credentials are encrypted, and any action that changes a connected
        system requires human approval. The full posture is on our{" "}
        <MarketingProseLink href="/trust">Trust</MarketingProseLink> page.
      </p>
    ),
  },
  {
    question: "How do I get access?",
    answer: (
      <p>
        legalOS is currently invite-only. Use the request access option on
        the home page to be in touch.
      </p>
    ),
  },
];

export default function FAQPage() {
  return (
    <MarketingPageShell
      label="Resources · FAQ"
      title="Frequently asked questions"
    >
      <dl>
        {FAQ_ITEMS.map((item) => (
          <div key={item.question} className="mt-8 border-t border-hairline pt-6">
            <dt className="text-[19px] font-semibold leading-snug tracking-tight text-foreground">
              {item.question}
            </dt>
            <dd className="mt-3 text-[15px] leading-[1.75] text-ink-2">
              {item.answer}
            </dd>
          </div>
        ))}
      </dl>
    </MarketingPageShell>
  );
}
