import { randomUUID } from "node:crypto";

import { notFound, redirect } from "next/navigation";

import { AgentForm } from "@/components/agents/agent-form";
import {
  createAgentAction,
  createTemplateAgentAction,
} from "@/lib/actions/agents";
import {
  getDepartmentIfAccessible,
  getOrganizationDefaultModel,
  isCurrentUserOrgAdmin,
  requireAuthUser,
} from "@/lib/auth/access";
import { DEFAULT_MODEL_FALLBACK, isSelectableModel } from "@/lib/llm/models";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface PageProps {
  searchParams: Promise<{
    department?: string;
    fork_from?: string;
    as_template?: string;
  }>;
}

/**
 * New agent surface — content only. Inherits chrome (rail + top bar)
 * from `app/(workspace)/layout.tsx`.
 *
 * Three flows in one page:
 *
 * - **Blank create** — `?department=<slug>` only. Form opens with empty
 *   defaults and the department-bound heading "New agent". Action:
 *   `createAgentAction` (creates a user-owned agent).
 * - **Fork from template** — `?department=<slug>&fork_from=<id>`.
 *   Inline query loads the template; defaults inherit the template's
 *   prompt / model / tools_enabled with a name suffix " (My Copy)".
 *   Action: `createAgentAction` (creates a user-owned fork).
 * - **Template create** — `?department=<slug>&as_template=true`.
 *   Admin-only path (Session 27). Heading is "New approved agent"
 *   and the action submits to `createTemplateAgentAction`, which
 *   creates a Pattern B canonical row with `is_template = true` and
 *   `created_by = null`. Non-admin access to this flow falls through
 *   to `notFound()` since the path is admin-gated.
 *
 * Missing department slug → redirect to `/workspace` so the user lands
 * somewhere useful instead of a hard error.
 */
export default async function NewAgentPage({ searchParams }: PageProps) {
  await requireAuthUser();
  const {
    department: departmentSlug,
    fork_from: forkFromId,
    as_template: asTemplateParam,
  } = await searchParams;

  if (!departmentSlug) {
    redirect("/workspace");
  }

  const department = await getDepartmentIfAccessible(departmentSlug);
  if (!department) {
    notFound();
  }

  const isAsTemplate = asTemplateParam === "true" || asTemplateParam === "1";

  // Admin-gate the template-create path. A non-admin hitting the URL
  // directly falls through to notFound() — single outcome avoids
  // leaking the existence of the admin path.
  if (isAsTemplate) {
    const canManageTemplates = await isCurrentUserOrgAdmin();
    if (!canManageTemplates) {
      notFound();
    }
  }

  // Agent-create model precedence: a fork inherits the template's model (set in
  // the fork branch below); otherwise a fresh agent starts on the org's default
  // model, and if none is configured (or it's no longer SELECTABLE — a fresh
  // agent should never start on a legacy model) on the canonical fallback.
  // This precedence is create-time only — it never touches the run path, where
  // a conversation keeps its frozen model snapshot.
  const orgDefaultModel = await getOrganizationDefaultModel();
  const blankCreateModel =
    orgDefaultModel && isSelectableModel(orgDefaultModel)
      ? orgDefaultModel
      : DEFAULT_MODEL_FALLBACK;

  let forkedFromAgent: { id: string; name: string } | null = null;
  let defaults = {
    name: "",
    description: "",
    systemPrompt: "",
    model: blankCreateModel,
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
      toolsEnabled: Array.isArray(template.tools_enabled)
        ? (template.tools_enabled as unknown as string[])
        : [],
    };
  }

  // Heading + subline per flow. Template-create gets a distinct heading
  // so the admin sees the org-wide stakes; fork-from-template keeps the
  // Session-8f-A copy; blank-create is unchanged.
  const heading = isAsTemplate
    ? "New approved agent"
    : forkedFromAgent
      ? "Fork template"
      : "New agent";
  const subline = isAsTemplate
    ? "Create an approved agent. Everyone in your organization will see it on the department launchpad and can chat with it."
    : forkedFromAgent
      ? "Review the fields below and adjust before saving. Your copy will appear under My agents."
      : "Configure a new agent for your workspace. You can edit it later.";

  return (
    <main className="mx-auto max-w-3xl">
      <header className="mb-8">
        <p className="text-sm text-muted-foreground">{department.name}</p>
        <h1 className="mt-1 text-3xl font-semibold">{heading}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{subline}</p>
      </header>

      <AgentForm
        mode="create"
        agentId={randomUUID()}
        existingAttachments={[]}
        defaults={defaults}
        departmentSlug={department.slug}
        forkedFromAgent={forkedFromAgent}
        action={isAsTemplate ? createTemplateAgentAction : createAgentAction}
      />
    </main>
  );
}
