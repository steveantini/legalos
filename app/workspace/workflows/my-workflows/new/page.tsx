import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WorkflowBuilder } from "@/components/workflows/workflow-builder";
import { HelpLink } from "@/components/workspace/help-link";
import { requireAuthUser, isCurrentUserOrgAdmin } from "@/lib/auth/access";
import { getWorkflowCapabilities } from "@/lib/workflows/capabilities";

export const metadata: Metadata = {
  title: "New workflow",
};

export default async function NewWorkflowPage() {
  await requireAuthUser();
  if (!(await isCurrentUserOrgAdmin())) notFound();

  const capabilities = await getWorkflowCapabilities();

  return (
    <main className="flex w-full max-w-3xl flex-col gap-9">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
            New workflow
          </h1>
          <p className="mt-[14px] max-w-[56ch] text-[14.5px] leading-[1.5] text-muted-foreground">
            Compose an ordered sequence of steps. Each one runs an agent, takes an
            action on a connected tool, or pauses for human approval. Save as a draft
            while you work; activate it when it&rsquo;s ready to run.
          </p>
        </div>
        <HelpLink topic="workflows-administration" className="mt-3" />
      </header>
      <WorkflowBuilder
        capabilities={capabilities}
        initial={{
          id: null,
          name: "",
          description: "",
          departmentId: null,
          status: "draft",
          steps: [],
        }}
      />
    </main>
  );
}
