import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Trust Center",
  description:
    "How legalOS protects your data, handles it with care, and keeps you in control of the work. Honest about what is live today and what is still ahead.",
};

/**
 * Trust Center hub — the summary of the three pillars, each linking to
 * a deeper sub-page (D-129): /trust/security, /trust/privacy, and
 * /trust/control. Shipped as Tier 1a (D-126), replacing the coming-soon
 * Security stub (which redirects here).
 *
 * Every security and privacy claim on this page and its sub-pages is
 * DERIVED FROM the source-of-truth docs (docs/SECURITY_ARCHITECTURE.md
 * and the data-handling inventory) and was verified against the
 * codebase before publication. When the architecture changes, these
 * pages must change with it in the same effort: never let the copy
 * here drift ahead of what the product actually does (D-129).
 *
 * Standalone editorial treatment in the marketing register: the landing
 * surface's tokens and type, a minimal brand header, a single reading
 * column. Server component — no client-side interactivity.
 */

interface Pillar {
  kicker: string;
  title: string;
  tagline: string;
  paragraphs: string[];
  /** The pillar's deeper sub-page. */
  href: string;
  linkLabel: string;
}

const PILLARS: Pillar[] = [
  {
    kicker: "Pillar one",
    title: "Security",
    tagline: "How your data is protected.",
    href: "/trust/security",
    linkLabel: "See the security posture",
    paragraphs: [
      "legalOS was built with security in the architecture from the first line of code, not added afterward. Every record is isolated at the database level, so one organization can never reach another’s data, and this is enforced by the database itself rather than by application logic. Credentials and connection secrets are encrypted with AES-256-GCM, and the keys to read them live only on the server. The database table that holds them is locked to server-side access alone. Access tokens are never exposed to the browser. Connections to outside systems are limited to official first-party servers, or servers your own organization hosts, never an arbitrary third party. Access is invite-only, with no public signup. Sensitive changes are enforced in three places at once: the interface, the server, and the database.",
    ],
  },
  {
    kicker: "Pillar two",
    title: "Privacy and data handling",
    tagline: "How your data is used.",
    href: "/trust/privacy",
    linkLabel: "Read how data is handled",
    paragraphs: [
      "Your data is yours, and legalOS treats it that way. legalOS does not sell your data, and legalOS does not train any models on it. There is no model training of any kind in the product. When you send work to an AI model, that inference is performed through Anthropic’s API under Anthropic’s commercial terms, which you can review. If you bring your own model key, that request runs under your own provider account and your own agreement, so the data boundary is yours to set. legalOS collects only what the product needs to work, and your administrators govern what your agents and connections can reach.",
      "Two things we state plainly rather than bury. Your organization’s administrators can access the conversations and work within your organization, because the work product belongs to the organization, not to any one user. And legalOS relies on a small set of infrastructure providers: Vercel for hosting, Supabase for data storage and authentication, and Anthropic for AI inference. When your organization connects Google Workspace, Google joins that list by your choice.",
    ],
  },
  {
    kicker: "Pillar three",
    title: "Control and accountability",
    tagline: "How you stay in command of the work.",
    href: "/trust/control",
    linkLabel: "How control and accountability work",
    paragraphs: [
      "This is the pillar most tools do not have, and it is the heart of what trust means for legal work. AI in legalOS does not act on its own. An agent can read and reason freely, but it cannot take an action that changes anything, such as sending a message, creating a document, or modifying a connected system, without a person approving that specific action first. This holds even when a workflow is set to run on its own. Reading and reasoning can proceed, but any action that changes a connected system still pauses for a human. Every step a workflow takes is recorded in order: what ran, what it produced, and whether a person approved it or it proceeded automatically. It is designed as an immutable record you can review. Your administrators decide which models, connections, and capabilities are available to your organization. You are never asked to take the software’s judgment on faith, because the software cannot act without you.",
    ],
  },
];

const CLOSING_PARAGRAPHS = [
  "Most software treats security and privacy as a compliance checkbox and trust as a tagline. For a product entrusted with privileged legal work, that is not enough. Security without control means an AI that protects your data while acting without your say. Control without careful data handling means a system you command but cannot trust with confidential matters. The commitment has to be all three at once.",
  "We also believe being trustworthy means being honest about what is built and what is still ahead. The security architecture described here is live in the product today. Formal data retention and deletion controls, account data export, and external compliance certifications are on our roadmap, not yet in place, and we will say so plainly until they are. A product asking a legal team for its trust should never overstate what it can actually do.",
];

export default function TrustPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="px-6 pt-7 min-[720px]:px-10">
        <Link
          href="/"
          className="inline-flex items-center gap-[10px] text-[15px] font-semibold tracking-[-0.015em] text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span
            aria-hidden
            className="inline-block h-[7px] w-[7px] rounded-full bg-primary"
          />
          legalOS
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[680px] px-6 pb-24 pt-16 min-[720px]:pt-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary">
          Company · Trust
        </p>

        <h1 className="mt-5 text-5xl font-semibold leading-tight tracking-tight text-foreground md:text-6xl">
          Trust Center
        </h1>

        <p className="mt-8 text-[17px] leading-[1.65] text-ink-2">
          For an in-house legal department or a law firm, trust is not a
          feature. It is the precondition for using the software at all. Your
          matters are privileged, and the information you hold about the
          business, its people, and the clients it serves is confidential.
          That work cannot be handed to a black box. legalOS is built so that
          trust is verifiable rather than asked for. Three pillars hold that
          promise. Your data is secure, your data is handled with care, and
          you stay in control of the work.
        </p>

        {PILLARS.map((pillar) => (
          <section
            key={pillar.title}
            className="mt-16 border-t border-hairline pt-12"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-caption">
              {pillar.kicker}
            </p>
            <h2 className="mt-4 text-[28px] font-semibold leading-tight tracking-tight text-foreground min-[720px]:text-[32px]">
              {pillar.title}
            </h2>
            <p className="mt-2 text-[16px] text-muted-foreground">
              {pillar.tagline}
            </p>
            <div className="mt-6 space-y-5">
              {pillar.paragraphs.map((paragraph, i) => (
                <p key={i} className="text-[15px] leading-[1.75] text-ink-2">
                  {paragraph}
                </p>
              ))}
            </div>
            <Link
              href={pillar.href}
              className="mt-7 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {pillar.linkLabel}{" "}
              <span aria-hidden className="text-primary">
                →
              </span>
            </Link>
          </section>
        ))}

        <section className="mt-16 border-t border-hairline pt-12">
          <h2 className="text-[28px] font-semibold leading-tight tracking-tight text-foreground min-[720px]:text-[32px]">
            Three pillars, one promise.
          </h2>
          <div className="mt-6 space-y-5">
            {CLOSING_PARAGRAPHS.map((paragraph, i) => (
              <p key={i} className="text-[15px] leading-[1.75] text-ink-2">
                {paragraph}
              </p>
            ))}
          </div>
        </section>

        <Link
          href="/"
          className="mt-16 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          ← Back to legalOS
        </Link>
      </main>
    </div>
  );
}
