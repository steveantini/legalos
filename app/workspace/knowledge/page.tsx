import type { Metadata } from "next";
import Link from "next/link";
import { PRODUCT_NAME } from "@/components/brand/wordmark";
import { HelpLink } from "@/components/workspace/help-link";

export const metadata: Metadata = {
  title: "Knowledge",
};

/**
 * Group landing for the Knowledge resource group — three leaves, ordered
 * setup-before-use: Collections (admin-drawn, transparently-sourced scopes
 * over connected repositories) come first because you create a Collection so
 * you can ask over it; then the two question tools, Research (citation-backed
 * read-and-reason answers across collections) and Structured Query (exact,
 * repeatable counts over a collection's prepared fields). The former Vault
 * leaf dissolved into Collections; Sources was superseded by the connector
 * catalog and its governance. Copy mirrors the rail's `RESOURCE_GROUPS`
 * Knowledge leaves, drive-agnostic and em-dash-free per the external-copy
 * convention; the product name routes through PRODUCT_NAME so a rename flows
 * through.
 */
const KNOWLEDGE_CHILDREN: ReadonlyArray<{
  title: string;
  href: string;
  description: string;
}> = [
  {
    title: "Collections",
    href: "/workspace/knowledge/collections",
    description: `Point ${PRODUCT_NAME} at the folders your team already uses, in whatever drive they live in. A Collection is just a named set of documents, the folders you want ${PRODUCT_NAME} to work with, like your contracts or your policy library. ${PRODUCT_NAME} keeps an inventory of what's there and where it lives; your files never move and their contents are never stored.`,
  },
  {
    title: "Research",
    href: "/workspace/knowledge/research",
    description: `Ask a question across the Collections you choose and get a clear answer backed by citations, with a short supporting quote from each document so you can verify it. Your documents are read live from where they live, never copied, and ${PRODUCT_NAME} tells you plainly if anything couldn't be read.`,
  },
  {
    title: "Structured Query",
    href: "/workspace/knowledge/structured-query",
    description: `Ask an exact question in plain language about the fields a Collection tracks, like how many agreements are NDAs or how many auto-renew, and get a precise count you can check. ${PRODUCT_NAME} shows you how it read your question and a supporting quote from each matching document. It is the exact, repeatable companion to Research's read-and-reason answers.`,
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
            Your team&rsquo;s documents, searchable in plain language, without
            moving them. Two ways to ask across them: Research reads and reasons
            (it is non-deterministic, weighing and interpreting like a careful
            analyst), and Structured Query answers exactly (it is deterministic,
            so the same question always returns the same precise, repeatable
            result). Set up Collections first, then use whichever fits the
            question.
          </p>
        </div>
        <HelpLink topic="knowledge" className="mt-3" />
      </header>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
