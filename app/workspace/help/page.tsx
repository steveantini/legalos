import type { Metadata } from "next";

import { ComingSoonCard } from "@/components/workspace/coming-soon-card";

export const metadata: Metadata = {
  title: "Help",
};

/**
 * Group landing for the Help resource group. Children mirror the rail's
 * `RESOURCE_GROUPS` Help leaves, EXCEPT the external "About legalOS"
 * leaf, which points at the marketing site and lives in the rail as a
 * sibling link rather than a card here. "Guides" copy comes from its
 * leaf page (`help/guides`); "What’s New" copy comes from `AREA_COPY`.
 * Both child surfaces are pre-ship, so each renders as a
 * `ComingSoonCard`.
 */
const HELP_CHILDREN: ReadonlyArray<{ title: string; description: string }> = [
  {
    title: "Guides",
    description:
      "Walkthroughs, how-tos, and product references for every part of legalOS. The browseable guides library lands here once the Help surface ships; an AI-powered help chat that knows the product end-to-end is on the roadmap.",
  },
  {
    title: "What’s New",
    description:
      "Recent feature shipments, improvements, and product updates. Arrives with the Help build.",
  },
];

export default function HelpPage() {
  return (
    <main className="flex flex-col gap-9">
      <header>
        <h1 className="max-w-[22ch] text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          Help
        </h1>
        <p className="mt-[14px] max-w-[56ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          Documentation, walkthroughs, and support resources for your team.
          Coming as the help surface is built out.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {HELP_CHILDREN.map((child) => (
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
