import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Workflows",
};

/**
 * Group landing for the Workflows resource group. Both surfaces are live:
 * "My Workflows" (Steps 4a-4b: build, run, watch, and approve) and the
 * "Template Library" (Step 5: ready-made workflows to fork and adapt).
 */
export default function WorkflowsPage() {
  return (
    <main className="flex flex-col gap-9">
      <header>
        <h1 className="max-w-[22ch] text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          Workflows
        </h1>
        <p className="mt-[14px] max-w-[56ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          Multi-step sequences your team can compose, run, and reuse: an agent, an
          action on a connected tool, or a pause for human approval, in order.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/workspace/workflows/my-workflows"
          className="flex min-h-[160px] flex-col gap-3 rounded-[14px] border border-border bg-card p-[22px] transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <h2 className="text-[19px] font-medium leading-[1.15] tracking-[-0.018em] text-foreground">
            My workflows
          </h2>
          <p className="text-[13px] leading-[1.45] text-muted-foreground">
            Compose multi-step workflows with no code, from the agents and tools
            your organization already has. Build, run, and follow them here.
          </p>
        </Link>
        <Link
          href="/workspace/workflows/template-library"
          className="flex min-h-[160px] flex-col gap-3 rounded-[14px] border border-border bg-card p-[22px] transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <h2 className="text-[19px] font-medium leading-[1.15] tracking-[-0.018em] text-foreground">
            Template Library
          </h2>
          <p className="text-[13px] leading-[1.45] text-muted-foreground">
            Ready-made workflows to start from: review an inbound NDA, review
            any contract, or review and respond. Copy one into your workflows,
            adapt it, and run it.
          </p>
        </Link>
      </div>
    </main>
  );
}
