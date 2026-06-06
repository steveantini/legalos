import type { Metadata } from "next";

import { UseTemplateButton } from "@/components/workflows/use-template-button";
import { requireAuthUser, isCurrentUserOrgAdmin } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { workflowReadback } from "@/lib/workflows/builder-view";
import type { WorkflowStep } from "@/lib/workflows/types";

export const metadata: Metadata = {
  title: "Template Library",
};

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  definition: { steps?: WorkflowStep[] } | null;
};

/**
 * The Template Library (Workflows arc Step 5): ready-made, org-specific
 * workflows to start from. Each template reads at a glance — name,
 * description, and the same plain-language "what it does" readback the
 * builder shows while composing — with "Use this template" forking it into a
 * new user-owned draft that opens in the builder. Templates themselves are
 * never run directly: status 'template' is structurally non-runnable, so the
 * fork-first flow is guaranteed, and an edited fork never touches the
 * template. Org members browse; forking follows the existing org-admin
 * authoring gate (RLS re-enforces).
 */
export default async function TemplateLibraryPage() {
  await requireAuthUser();
  const canAuthor = await isCurrentUserOrgAdmin();

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("workflow_definitions")
    .select("id, name, description, definition")
    .eq("status", "template")
    .order("name", { ascending: true });
  const templates = (data ?? []) as TemplateRow[];

  // Agent names for the plain-language readback (RLS-scoped, like the run view).
  const agentIds = [
    ...new Set(
      templates.flatMap((t) =>
        (t.definition?.steps ?? [])
          .filter((s) => s.type === "agent")
          .map((s) => s.agentId),
      ),
    ),
  ];
  const { data: agentRows } =
    agentIds.length > 0
      ? await supabase.from("agents").select("id, name").in("id", agentIds)
      : { data: [] };
  const agentNameById = new Map(
    ((agentRows ?? []) as Array<{ id: string; name: string }>).map((a) => [
      a.id,
      a.name,
    ]),
  );
  // Starter templates carry no tool steps; an empty map falls back to the
  // chat-consistent tool label derivation inside the readback.
  const readbackCaps = { agentNameById, toolByKey: new Map() };

  return (
    <main className="flex w-full max-w-4xl flex-col gap-9">
      <header>
        <h1 className="text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          Template Library
        </h1>
        <p className="mt-[14px] max-w-[56ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          Ready-made workflows to start from. Use one to copy it into your
          workflows as a draft you fully own, then adapt it, activate it, and
          run it.
        </p>
      </header>

      {templates.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {templates.map((template) => {
            const steps = Array.isArray(template.definition?.steps)
              ? template.definition.steps
              : [];
            const readback = workflowReadback(steps, readbackCaps);
            return (
              <li
                key={template.id}
                className="rounded-[14px] border border-border bg-card p-5"
              >
                <h2 className="text-[17px] font-medium leading-[1.2] tracking-[-0.012em] text-foreground">
                  {template.name}
                </h2>
                {template.description ? (
                  <p className="mt-1.5 text-[13.5px] leading-[1.45] text-muted-foreground">
                    {template.description}
                  </p>
                ) : null}

                {readback.length > 0 ? (
                  <div className="mt-4 rounded-lg border border-border bg-paper-2 px-4 py-3">
                    <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-caption">
                      What it does
                    </p>
                    <ol className="mt-2 flex flex-col gap-1">
                      {readback.map((phrase, i) => (
                        <li
                          key={steps[i].id}
                          className="flex gap-2 text-[13px] leading-[1.55] text-foreground/90"
                        >
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {i + 1}.
                          </span>
                          <span>{phrase}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}

                <div className="mt-4 flex items-center gap-3">
                  {canAuthor ? (
                    <UseTemplateButton
                      templateId={template.id}
                      templateName={template.name}
                    />
                  ) : (
                    <p className="text-[12.5px] text-muted-foreground">
                      An admin can start a workflow from this template.
                    </p>
                  )}
                  <p className="text-[12px] text-muted-foreground">
                    {steps.length === 1 ? "1 step" : `${steps.length} steps`}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-[14px] border border-dashed border-border bg-card/50 px-6 py-14 text-center">
          <p className="text-[15px] font-medium text-foreground">
            No templates yet
          </p>
          <p className="max-w-[44ch] text-[13.5px] leading-[1.5] text-muted-foreground">
            Starter templates are seeded by the platform. Once they arrive,
            you can copy one into your workflows and adapt it.
          </p>
        </div>
      )}
    </main>
  );
}
