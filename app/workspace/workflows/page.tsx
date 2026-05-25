import type { Metadata } from "next";

import { ComingSoonCard } from "@/components/workspace/coming-soon-card";

export const metadata: Metadata = {
  title: "Workflows",
};

/**
 * Group landing for the Workflows resource group. Children mirror the
 * rail's `RESOURCE_GROUPS` Workflows leaves. "My Workflows" copy comes
 * from its leaf page (`workflows/my-workflows`); "Template Library"
 * copy comes from `AREA_COPY`, adapted to be em-dash-free. Both child
 * surfaces are pre-ship, so each renders as a `ComingSoonCard`.
 */
const WORKFLOWS_CHILDREN: ReadonlyArray<{ title: string; description: string }> =
  [
    {
      title: "My Workflows",
      description:
        "Compose multi-step agentic sequences from natural language. Run them across departments; call them from the assistant. Your authored workflows live here once the surface ships.",
    },
    {
      title: "Template Library",
      description:
        "Pre-built workflows for common legal tasks: contract review, supplier diligence, case timeline extraction. Fork a template, customize it, run it across your matters. Arrives with the Workflows build.",
    },
  ];

export default function WorkflowsPage() {
  return (
    <main className="flex flex-col gap-9">
      <header>
        <h1 className="max-w-[22ch] text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          Workflows
        </h1>
        <p className="mt-[14px] max-w-[56ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          Multi-step workflows your team can adopt, customize, and reuse. Coming
          as the workflows surface is built out.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {WORKFLOWS_CHILDREN.map((child) => (
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
