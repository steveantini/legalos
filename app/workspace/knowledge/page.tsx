import type { Metadata } from "next";

import { ComingSoonCard } from "@/components/workspace/coming-soon-card";

export const metadata: Metadata = {
  title: "Knowledge",
};

/**
 * Group landing for the Knowledge resource group. Children and their
 * copy mirror the rail's `RESOURCE_GROUPS` Knowledge leaves and the
 * `AREA_COPY` descriptions in `components/coming-soon/coming-soon.tsx`,
 * adapted to be em-dash-free per the external-copy convention. None of
 * these child surfaces have shipped yet, so each renders as a
 * `ComingSoonCard` (distinct from the locked-department treatment).
 */
const KNOWLEDGE_CHILDREN: ReadonlyArray<{ title: string; description: string }> =
  [
    {
      title: "Research",
      description:
        "Ask a legal question; get a citation-backed answer drawing from three sources: your firm’s internal corpus, the open web, and trusted legal content partnerships. The same research capability your agents call as a tool. Arrives with the Knowledge reshape.",
    },
    {
      title: "Vault",
      description:
        "Your firm’s internal documents, precedents, and memos, the curated corpus your assistant and agents draw from when answering questions. Arrives with the Knowledge reshape.",
    },
    {
      title: "Sources",
      description:
        "Admin configuration for content partnerships (EDGAR, Westlaw, regional case law) and how the open web is searched. Arrives with the Knowledge reshape.",
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
          A searchable home for your team’s playbooks, precedent, and reference
          materials. Coming as the knowledge surface is built out.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {KNOWLEDGE_CHILDREN.map((child) => (
          <ComingSoonCard
            key={child.title}
            title={child.title}
            description={child.description}
          />
        ))}
      </div>
    </main>
  );
}
