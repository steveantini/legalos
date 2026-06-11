import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Knowledge",
};

/**
 * Group landing for the Knowledge resource group — both leaves live as of
 * Step 2: Research (citation-backed answers across collections) and
 * Collections (admin-drawn, transparently-sourced scopes over connected
 * repositories). The former Vault leaf dissolved into Collections; Sources
 * was superseded by the connector catalog and its governance. Copy mirrors
 * the rail's `RESOURCE_GROUPS` Knowledge leaves, em-dash-free per the
 * external-copy convention.
 */
const KNOWLEDGE_CHILDREN: ReadonlyArray<{
  title: string;
  href: string;
  description: string;
}> = [
  {
    title: "Research",
    href: "/workspace/knowledge/research",
    description:
      "Ask a question across the collections you choose and get a citation-backed answer with per-document findings, a cost preview before every run, and honest reporting of anything that couldn't be read.",
  },
  {
    title: "Collections",
    href: "/workspace/knowledge/collections",
    description:
      "Named scopes your administrators draw over connected repositories, like a contracts folder in Google Drive. Every collection shows exactly where its documents live; legalOS keeps an inventory, never the documents.",
  },
];
export default function KnowledgePage() {
  return (
    <main className="flex flex-col gap-9">
      <header>
        <h1 className="max-w-[22ch] text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          Knowledge
        </h1>
        <p className="mt-[14px] max-w-[56ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          Your team&rsquo;s knowledge, where it already lives. Collections draw
          named scopes over the repositories you use; Research answers
          questions across them.
        </p>
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
