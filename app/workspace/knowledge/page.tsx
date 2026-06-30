import type { Metadata } from "next";
import Link from "next/link";
import { PRODUCT_NAME } from "@/components/brand/wordmark";
import { HelpLink } from "@/components/workspace/help-link";

export const metadata: Metadata = {
  title: "Knowledge",
};

/**
 * Group landing for the Knowledge resource group. The user model is "pick
 * folders, ask": you point legalOS at folders in the drives you already use,
 * then ask with one of two tools, Research (citation-backed read-and-reason
 * answers, non-deterministic) and Structured Query (exact, repeatable answers
 * over fields you set up, deterministic). The former managed "Collections"
 * section is gone from the nav and is no longer a user-facing concept (the
 * backend inventory stays as invisible infrastructure); folder-picking moves
 * into each tool, and folder-access governance moves into Policy & access, in
 * later steps. Copy mirrors the rail's `RESOURCE_GROUPS` Knowledge leaves,
 * drive-agnostic and em-dash-free per the external-copy convention; the product
 * name routes through PRODUCT_NAME so a rename flows through.
 */
const KNOWLEDGE_CHILDREN: ReadonlyArray<{
  title: string;
  href: string;
  description: string;
}> = [
  {
    title: "Research",
    href: "/workspace/knowledge/research",
    description: `Ask a question across the folders you choose and get a clear answer backed by citations, and for each document it draws on, it shows you the exact line it used, so you can check the answer against the source yourself. Your documents are read live from where they live, never copied, and ${PRODUCT_NAME} tells you plainly if anything couldn't be read.`,
  },
  {
    title: "Structured Query",
    href: "/workspace/knowledge/structured-query",
    description: `Ask an exact question in plain language about fields you set up, like how many agreements expire in 2026 or how many auto-renew, and get a precise count you can check. ${PRODUCT_NAME} shows you how it read your question and a supporting quote from each matching document. It is the exact, repeatable companion to Research's read-and-reason answers.`,
  },
];
export default function KnowledgePage() {
  return (
    <main className="flex flex-col gap-9">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="max-w-[22ch] text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
            Knowledge
          </h1>
          <p className="mt-[14px] max-w-[62ch] text-[14.5px] leading-[1.5] text-muted-foreground">
            Keep your documents as a single source of truth. {PRODUCT_NAME}{" "}
            reads them where they live and always works from the current
            version, so nothing forks, drifts, or falls out of sync. Point{" "}
            {PRODUCT_NAME} at folders in the drives you already use, then ask.
            Two ways to ask: Research reads and reasons (non-deterministic: it
            weighs and interprets like a careful analyst), and Structured Query
            answers exactly (deterministic: the same question always returns the
            same precise, repeatable result).
          </p>
        </div>
        <HelpLink topic="knowledge" className="mt-3" />
      </header>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Live children: same card geometry as the coming-soon family, but
            real navigation targets with the standard hover-deepen. */}
        {KNOWLEDGE_CHILDREN.map((child) => (
          <Link
            key={child.href}
            href={child.href}
            className="group flex min-h-[160px] flex-col gap-3 rounded-[14px] border border-border bg-card p-[22px] transition-colors duration-release ease-release hover:bg-paper-2 hover:duration-hover hover:ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-[19px] font-medium leading-[1.15] tracking-[-0.018em] text-foreground">
                {child.title}
              </h2>
              <span
                aria-hidden="true"
                className="shrink-0 text-primary opacity-40 transition-opacity duration-hover ease-soft group-hover:opacity-100 motion-reduce:transition-none"
              >
                →
              </span>
            </div>
            <p className="text-[13px] leading-[1.45] text-muted-foreground">
              {child.description}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
