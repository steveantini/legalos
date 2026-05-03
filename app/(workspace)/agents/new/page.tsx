import { randomUUID } from "node:crypto";

import { notFound, redirect } from "next/navigation";

import { AgentForm } from "@/components/agents/agent-form";
import { createAgentAction } from "@/lib/actions/agents";
import {
  getDepartmentIfAccessible,
  requireAuthUser,
} from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface PageProps {
  searchParams: Promise<{ department?: string; fork_from?: string }>;
}

/**
 * New agent surface — content only. Inherits chrome (rail + top bar)
 * from `app/(workspace)/layout.tsx`.
 *
 * Two flows in one page:
 * - **Blank create** — `?department=<slug>` only. Form opens with empty
 *   defaults and the department-bound name copy "New agent".
 * - **Fork from template** — `?department=<slug>&fork_from=<id>`. Inline
 *   query loads the template (single-caller, no helper extraction);
 *   notFound() on any of 6 conditions (missing, RLS-hidden, wrong type,
 *   not a template, wrong department, missing prompt or model). Defaults
 *   inherit the template's prompt / model / tools_enabled with a name
 *   suffix " (My Copy)".
 *
 * `randomUUID()` pre-generates the new agent's primary key server-side;
 * the form submits it via `createAgentAction` as the row's id. Action
 * redirects to `/departments/<slug>` (the renovated launchpad) on
 * success — the new agent appears under My Agents there.
 *
 * Missing department slug → redirect to `/` (the workspace landing) so
 * the user lands somewhere useful instead of a hard error.
 */
export default async function NewAgentPage({ searchParams }: PageProps) {
  await requireAuthUser();
  const { department: departmentSlug, fork_from: forkFromId } =
    await searchParams;

  if (!departmentSlug) {
    redirect("/");
  }

  const department = await getDepartmentIfAccessible(departmentSlug);
  if (!department) {
    notFound();
  }

  let forkedFromAgent: { id: string; name: string } | null = null;
  let defaults = {
    name: "",
    description: "",
    systemPrompt: "",
    model: "anthropic/claude-sonnet-4-6",
    toolsEnabled: [] as string[],
  };

  if (forkFromId) {
    const supabase = await createSupabaseServerClient();
    const { data: template } = await supabase
      .from("agents")
      .select(
        "id, name, description, type, is_template, department_id, system_prompt, model, tools_enabled",
      )
      .eq("id", forkFromId)
      .maybeSingle();

    // Same notFound() result for any failure path so we never leak which
    // condition tripped: missing template, RLS-hidden, wrong type, wrong
    // department, or non-template. The user sees one outcome.
    if (
      !template ||
      template.is_template !== true ||
      template.type !== "native" ||
      template.department_id !== department.id ||
      !template.system_prompt ||
      !template.model
    ) {
      notFound();
    }

    forkedFromAgent = { id: template.id, name: template.name };
    defaults = {
      name: `${template.name} (My Copy)`,
      description: template.description ?? "",
      systemPrompt: template.system_prompt,
      model: template.model,
      // Forks inherit the template's tools_enabled per architecture §2;
      // the user can flip toggles before saving if they want to change
      // the inherited behavior.
      toolsEnabled: Array.isArray(template.tools_enabled)
        ? (template.tools_enabled as unknown as string[])
        : [],
    };
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <p className="text-sm text-muted-foreground">{department.name}</p>
        <h1 className="mt-1 text-3xl font-semibold">
          {forkedFromAgent ? "Fork template" : "New agent"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {forkedFromAgent
            ? "Review the fields below and adjust before saving. Your copy will appear under My Agents."
            : "Configure a new agent for your workspace. You can edit it later."}
        </p>
      </header>

      <AgentForm
        mode="create"
        agentId={randomUUID()}
        existingAttachments={[]}
        defaults={defaults}
        departmentSlug={department.slug}
        forkedFromAgent={forkedFromAgent}
        action={createAgentAction}
      />
    </main>
  );
}
