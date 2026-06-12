import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WorkflowBuilder } from "@/components/workflows/workflow-builder";
import { HelpLink } from "@/components/workspace/help-link";
import { requireAuthUser, isCurrentUserOrgAdmin } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkflowCapabilities } from "@/lib/workflows/capabilities";
import type { WorkflowStep } from "@/lib/workflows/types";

export const metadata: Metadata = {
  title: "Edit workflow",
};

type DefinitionRow = {
  id: string;
  name: string;
  description: string | null;
  department_id: string | null;
  status: "draft" | "active" | "archived" | "template";
  definition: { steps?: WorkflowStep[] } | null;
};

export default async function EditWorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuthUser();
  if (!(await isCurrentUserOrgAdmin())) notFound();

  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("workflow_definitions")
    .select("id, name, description, department_id, status, definition")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const row = data as DefinitionRow;

  // A TEMPLATE is never edited here (Step 5): the builder's save would flip
  // its status and corrupt the seeded row. The Template Library is its
  // surface; "Use this template" forks an editable copy that opens here.
  if (row.status === "template") notFound();

  // An archived workflow opens in the builder as a draft for re-editing; the
  // status select lets the author re-activate it.
  const status = row.status === "archived" ? "draft" : row.status;
  const capabilities = await getWorkflowCapabilities();

  return (
    <main className="flex w-full max-w-3xl flex-col gap-9">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
            Edit workflow
          </h1>
          <p className="mt-[14px] max-w-[56ch] text-[14.5px] leading-[1.5] text-muted-foreground">
            Change the steps, then save. Edits don&rsquo;t affect runs already in
            progress, which keep the version they started with.
          </p>
        </div>
        <HelpLink topic="workflows-administration" className="mt-3" />
      </header>
      <WorkflowBuilder
        capabilities={capabilities}
        initial={{
          id: row.id,
          name: row.name,
          description: row.description ?? "",
          departmentId: row.department_id,
          status,
          steps: Array.isArray(row.definition?.steps) ? row.definition.steps : [],
        }}
      />
    </main>
  );
}
