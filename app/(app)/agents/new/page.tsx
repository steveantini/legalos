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
  };

  if (forkFromId) {
    const supabase = await createSupabaseServerClient();
    const { data: template } = await supabase
      .from("agents")
      .select(
        "id, name, description, type, is_template, department_id, system_prompt, model",
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
        defaults={defaults}
        departmentSlug={department.slug}
        forkedFromAgent={forkedFromAgent}
        action={createAgentAction}
      />
    </main>
  );
}
