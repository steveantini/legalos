import type { Metadata } from "next";

import { ComingSoonCard } from "@/components/workspace/coming-soon-card";

export const metadata: Metadata = {
  title: "Integrations",
};

/**
 * Group landing for the Integrations resource group. Children mirror
 * the rail's `RESOURCE_GROUPS` Integrations leaves. "Connections" copy
 * comes from its leaf page (`integrations/connections`); "Marketplace"
 * copy comes from `AREA_COPY`, adapted to be em-dash-free. Both child
 * surfaces are pre-ship, so each renders as a `ComingSoonCard`.
 */
const INTEGRATIONS_CHILDREN: ReadonlyArray<{
  title: string;
  description: string;
}> = [
  {
    title: "Connections",
    description:
      "Manage the operational systems connected to legalOS: contract lifecycle managers, document management systems, matter management, calendar, email. Active integrations and their per-source configuration land here once the Integrations surface ships.",
  },
  {
    title: "Marketplace",
    description:
      "Browse available integrations to install: contract lifecycle managers, document management systems, matter management, calendar, email. Configure once at the admin level; agents pick up the connection automatically. Arrives with the Integrations build.",
  },
];

export default function IntegrationsPage() {
  return (
    <main className="flex flex-col gap-9">
      <header>
        <h1 className="max-w-[22ch] text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          Integrations
        </h1>
        <p className="mt-[14px] max-w-[56ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          Systems legalOS connects to so agents can read and write across your
          stack. Coming as the integrations surface is built out.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {INTEGRATIONS_CHILDREN.map((child) => (
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
