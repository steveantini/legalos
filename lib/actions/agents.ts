"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isCurrentUserOrgAdmin } from "@/lib/auth/access";
import { MODEL_PRICING } from "@/lib/llm/pricing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server actions for the agent CRUD surface.
 *
 * All writes are RLS-scoped — the server-client carries the user's JWT and
 * the `agents_user_creates_own` (0009) and `agents_user_updates_own` (0010)
 * policies enforce ownership, escalation guards, and per-department access
 * at the database layer.
 *
 * Hard delete is intentionally not user-callable. Soft-deleted rows beyond
 * 30 days remain in the DB until a future cron job hard-deletes them.
 */

const SUPPORTED_MODELS = Object.keys(MODEL_PRICING) as [string, ...string[]];

/**
 * Zod schema for the create-agent form. Bounded fields (`model`) match
 * MODEL_PRICING so an unsupported id can't make it past validation. Free
 * fields (name, description, system_prompt) are length-bounded; the
 * backstop CHECK constraints in 0001 / 0006 / 0009 catch anything that
 * slips past.
 *
 * agent_id is pre-allocated client-side so the form can upload draft
 * attachments to <user_id>/<agent_id>/... before the agent row exists,
 * then atomically insert agent + attachment_rows here at save time.
 *
 * pending_attachments arrives as a JSON-encoded string in the form's
 * hidden field — FormData can carry primitives and Files but not
 * structured objects directly.
 */
const createAgentSchema = z.object({
  agent_id: z.string().uuid(),
  department_slug: z.string().min(1),
  name: z.string().trim().min(1, "Name is required.").max(120, "Name is too long."),
  description: z.string().trim().max(500, "Description is too long.").optional(),
  system_prompt: z
    .string()
    .trim()
    .min(1, "System prompt is required.")
    .max(20000, "System prompt is too long."),
  model: z.enum(SUPPORTED_MODELS, { message: "Unsupported model." }),
  forked_from_agent_id: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  pending_attachments: z
    .string()
    .optional()
    .transform((s) => (s && s.length > 0 ? s : "[]")),
  /**
   * Form switch sends "on" when checked and is absent when unchecked.
   * The action shapes the resulting tools_enabled JSONB array from this
   * field — there is no free-form `tools` input, so unknown tool ids
   * cannot reach the database. Future tools add a sibling field.
   */
  tool_web_search: z
    .string()
    .optional()
    .transform((v) => v === "on"),
});

const pendingAttachmentSchema = z.object({
  storagePath: z.string().min(1),
  originalFilename: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  extractedText: z.string().nullable(),
});

export type CreateAgentResult =
  | { ok: true }
  | {
      ok: false;
      formError?: string;
      fieldErrors?: Partial<Record<keyof z.infer<typeof createAgentSchema>, string>>;
    };

/**
 * Result type shared by both create and edit form actions. Field-key union
 * covers any input either form might surface — the form component reads
 * fieldErrors[fieldName] without caring which action produced it.
 */
export type AgentFormResult =
  | { ok: true }
  | {
      ok: false;
      formError?: string;
      fieldErrors?: Partial<
        Record<
          | "name"
          | "description"
          | "system_prompt"
          | "model"
          | "department_slug"
          | "forked_from_agent_id"
          | "agent_id",
          string
        >
      >;
    };

/**
 * Generate a URL-safe agent slug from the user-provided name plus a short
 * random suffix. The (organization_id, slug) unique constraint on
 * `agents` makes raw kebab-case susceptible to collisions when two users
 * pick the same name; the suffix is a uniqueness mechanism, not a public
 * identifier (URLs use UUIDs). Suffix length 6 keeps collision risk
 * negligible at any plausible scale.
 */
function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "agent";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

export async function createAgentAction(
  _prev: CreateAgentResult,
  formData: FormData,
): Promise<CreateAgentResult> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, formError: "You must be signed in to create an agent." };
  }

  const parsed = createAgentSchema.safeParse({
    agent_id: formData.get("agent_id"),
    department_slug: formData.get("department_slug"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    system_prompt: formData.get("system_prompt"),
    model: formData.get("model"),
    forked_from_agent_id: formData.get("forked_from_agent_id") || undefined,
    pending_attachments: formData.get("pending_attachments") || undefined,
    tool_web_search: formData.get("tool_web_search") || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: NonNullable<
      Extract<CreateAgentResult, { ok: false }>["fieldErrors"]
    > = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.infer<typeof createAgentSchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const input = parsed.data;

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) {
    return { ok: false, formError: "Could not load your profile. Try signing in again." };
  }

  const { data: department } = await supabase
    .from("departments")
    .select("id, slug")
    .eq("slug", input.department_slug)
    .maybeSingle();
  if (!department) {
    return { ok: false, formError: "That department is not available." };
  }

  const { data: deptAccess } = await supabase
    .from("user_department_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("department_id", department.id)
    .maybeSingle();
  if (!deptAccess) {
    return { ok: false, formError: "You don't have access to that department." };
  }

  if (input.forked_from_agent_id) {
    const { data: template } = await supabase
      .from("agents")
      .select("id, department_id, is_template, type")
      .eq("id", input.forked_from_agent_id)
      .maybeSingle();
    if (
      !template ||
      template.is_template !== true ||
      template.type !== "native" ||
      template.department_id !== department.id
    ) {
      return { ok: false, formError: "That template is not available to fork." };
    }
  }

  // Parse pending attachments uploaded as drafts during the form's life
  // (architecture §3 + 8h plan §2). Storage paths must live under
  // <user_id>/<agent_id>/ so the storage policies in 0008 cover them
  // and so they're addressable after the agent row inserts. Anything
  // else gets rejected here as a defense-in-depth check.
  let pendingAttachments: Array<z.infer<typeof pendingAttachmentSchema>> = [];
  try {
    const raw = JSON.parse(input.pending_attachments) as unknown;
    if (Array.isArray(raw)) {
      pendingAttachments = raw
        .map((item) => pendingAttachmentSchema.safeParse(item))
        .filter((r): r is { success: true; data: z.infer<typeof pendingAttachmentSchema> } => r.success)
        .map((r) => r.data);
    }
  } catch {
    pendingAttachments = [];
  }
  const expectedPathPrefix = `${user.id}/${input.agent_id}/`;
  for (const att of pendingAttachments) {
    if (!att.storagePath.startsWith(expectedPathPrefix)) {
      return {
        ok: false,
        formError: "Attachment metadata is malformed. Try again.",
      };
    }
  }

  const toolsEnabled: string[] = input.tool_web_search ? ["web_search"] : [];

  const insertPayload = {
    id: input.agent_id,
    organization_id: profile.organization_id,
    department_id: department.id,
    slug: generateSlug(input.name),
    name: input.name,
    description: input.description ?? null,
    type: "native" as const,
    system_prompt: input.system_prompt,
    model: input.model,
    sort_order: 0,
    is_active: true,
    is_template: false,
    forked_from_agent_id: input.forked_from_agent_id ?? null,
    tools_enabled: toolsEnabled,
    default_output_format: "markdown" as const,
    created_by: user.id,
  };

  const { error: insertError } = await supabase
    .from("agents")
    .insert(insertPayload)
    .select("id")
    .single();
  if (insertError) {
    console.error("createAgentAction insert failed", insertError);
    return { ok: false, formError: "Could not create agent. Try again." };
  }

  if (pendingAttachments.length > 0) {
    const { error: attErr } = await supabase
      .from("agent_attachments")
      .insert(
        pendingAttachments.map((att) => ({
          agent_id: input.agent_id,
          user_id: user.id,
          organization_id: profile.organization_id,
          storage_path: att.storagePath,
          original_filename: att.originalFilename,
          content_type: att.contentType,
          size_bytes: att.sizeBytes,
          extracted_text: att.extractedText,
        })),
      );
    if (attErr) {
      console.error("agent_attachments bulk insert failed", {
        code: attErr.code,
      });
      // The agent row is in. Don't roll back — let the user open the
      // edit form and re-attach. Surface a soft warning via the form
      // error rather than a hard failure.
      return {
        ok: false,
        formError:
          "Agent created, but attachments could not be linked. Open the agent and try attaching again.",
      };
    }
  }

  redirect(`/workspace/departments/${department.slug}`);
}

/**
 * Zod schema for the edit-agent form. Department is fixed at creation and
 * does not change on edit; forked_from_agent_id is set at creation and is
 * not user-editable. Slug also stays stable across edits — slugs are an
 * internal uniqueness mechanism (URLs use UUIDs), and renaming should not
 * regenerate a public-facing identifier even if it isn't actually public.
 */
const updateAgentSchema = z.object({
  agent_id: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required.").max(120, "Name is too long."),
  description: z.string().trim().max(500, "Description is too long.").optional(),
  system_prompt: z
    .string()
    .trim()
    .min(1, "System prompt is required.")
    .max(20000, "System prompt is too long."),
  model: z.enum(SUPPORTED_MODELS, { message: "Unsupported model." }),
  tool_web_search: z
    .string()
    .optional()
    .transform((v) => v === "on"),
});

export async function updateAgentAction(
  _prev: AgentFormResult,
  formData: FormData,
): Promise<AgentFormResult> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, formError: "You must be signed in to edit an agent." };
  }

  const parsed = updateAgentSchema.safeParse({
    agent_id: formData.get("agent_id"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    system_prompt: formData.get("system_prompt"),
    model: formData.get("model"),
    tool_web_search: formData.get("tool_web_search") || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: NonNullable<
      Extract<AgentFormResult, { ok: false }>["fieldErrors"]
    > = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<
        Extract<AgentFormResult, { ok: false }>["fieldErrors"]
      >;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const input = parsed.data;

  // Defense in depth — RLS would also reject a non-owner update, but the
  // application gate gives a clearer error and avoids the round-trip.
  // Two permitted paths post-Session-27 (D-041 mirror-RLS principle):
  // owner-of-user-agent OR org-admin-of-template. The underlying RLS
  // (`agents_user_updates_own` for the first, `agents_admin_write` for
  // the second) admits both; the app layer matches that.
  //
  // The select also pulls the locked-field columns and source_origin so
  // the C4L hybrid-edit guard below can compare submitted values to
  // upstream-managed state without a second round-trip.
  const { data: agent } = await supabase
    .from("agents")
    .select(
      "id, created_by, is_template, type, name, description, system_prompt, tools_enabled, source_origin",
    )
    .eq("id", input.agent_id)
    .maybeSingle();
  const isOrgAdmin = agent ? await isCurrentUserOrgAdmin() : false;
  const isOwnerOfUserAgent =
    !!agent && agent.created_by === user.id && agent.is_template === false;
  const isAdminOfTemplate =
    !!agent && agent.is_template === true && isOrgAdmin;
  if (
    !agent ||
    (!isOwnerOfUserAgent && !isAdminOfTemplate) ||
    agent.type !== "native"
  ) {
    return { ok: false, formError: "You don't have permission to edit this agent." };
  }

  // C4L hybrid-edit guard: name, description, system_prompt, and
  // tool_web_search are managed upstream and cannot be mutated even by
  // org admins. The UI renders these fields read-only with hint text;
  // this check rejects any value that arrives different from the DB
  // (the only way that happens is a determined client bypassing the UI).
  // Model, attachments, and default_output_format remain editable —
  // they're the admin's adjust-to-your-org levers.
  if (agent.source_origin !== null) {
    const dbDescription = (agent.description ?? "") as string;
    const submittedDescription = input.description ?? "";
    const dbToolsEnabled = Array.isArray(agent.tools_enabled)
      ? (agent.tools_enabled as unknown as string[])
      : [];
    const dbWebSearch = dbToolsEnabled.includes("web_search");
    const lockedChanges: string[] = [];
    if (input.name !== agent.name) lockedChanges.push("name");
    if (submittedDescription !== dbDescription) lockedChanges.push("description");
    if (input.system_prompt !== agent.system_prompt) {
      lockedChanges.push("system prompt");
    }
    if (input.tool_web_search !== dbWebSearch) lockedChanges.push("web search");
    if (lockedChanges.length > 0) {
      return {
        ok: false,
        formError: `These fields are managed by Claude for Legal and can't be changed: ${lockedChanges.join(", ")}. Refresh and try again.`,
      };
    }
  }

  const toolsEnabled: string[] = input.tool_web_search ? ["web_search"] : [];

  const { error: updateError } = await supabase
    .from("agents")
    .update({
      name: input.name,
      description: input.description ?? null,
      system_prompt: input.system_prompt,
      model: input.model,
      tools_enabled: toolsEnabled,
    })
    .eq("id", input.agent_id);
  if (updateError) {
    console.error("updateAgentAction update failed", updateError);
    return { ok: false, formError: "Could not save changes. Try again." };
  }

  redirect(`/workspace/agents/${input.agent_id}`);
}

const agentIdSchema = z.object({
  agent_id: z.string().uuid(),
});

/**
 * Composer model-picker server action (session 17a). The chat composer
 * exposes a 3-model picker inline, so users can change the agent's
 * runtime model without leaving the conversation.
 *
 * Owner OR admin-of-template at the application layer, matching the
 * permission gate in `updateAgentAction` (the edit form's server
 * action). The symmetry is intentional: an admin who can edit a
 * template's model via the form must also be able to edit it via the
 * composer's model picker, otherwise the two surfaces lie to the user
 * about what they can do. RLS enforces the same scope at the DB layer
 * regardless.
 *
 * Historical note: this action was owner-only until commit [sha
 * pending] — the original gate predated the C4L hybrid-edit work
 * (commit 2bc28bd) that widened `updateAgentAction` to admin-of-
 * template. The composer side wasn't widened in that same pass; this
 * commit completes the pair.
 *
 * Web search is a read-only indicator in the composer (see
 * WebSearchIndicator) — its toggle stays in the edit form, no companion
 * server action lives here. C4L locked fields (name, description,
 * system_prompt, web_search) are not editable from either surface; the
 * composer can't submit those, so no extra hybrid-edit guard is needed
 * here.
 *
 * `revalidatePath('/workspace/agents/<id>')` after each write so the agent header's
 * model chip reflects the new state without a full reload (chips are
 * server-rendered from the agent record per session 15).
 */

export type AgentSettingResult = { ok: true } | { ok: false; error: string };

const updateAgentModelInputSchema = z.object({
  agent_id: z.string().uuid(),
  model: z.enum(SUPPORTED_MODELS, { message: "Unsupported model." }),
});

export async function updateAgentModelAction(
  formData: FormData,
): Promise<AgentSettingResult> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }

  const parsed = updateAgentModelInputSchema.safeParse({
    agent_id: formData.get("agent_id"),
    model: formData.get("model"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid request." };
  }

  const { data: agent } = await supabase
    .from("agents")
    .select("id, created_by, is_template, type, deleted_at")
    .eq("id", parsed.data.agent_id)
    .maybeSingle();
  // Owner-of-user-agent OR org-admin-of-template — mirrors
  // updateAgentAction's gate so the form and composer agree on who can
  // change a template's model. See the doc comment above.
  const isOrgAdmin = agent ? await isCurrentUserOrgAdmin() : false;
  const isOwnerOfUserAgent =
    !!agent && agent.created_by === user.id && agent.is_template === false;
  const isAdminOfTemplate =
    !!agent && agent.is_template === true && isOrgAdmin;
  if (
    !agent ||
    (!isOwnerOfUserAgent && !isAdminOfTemplate) ||
    agent.type !== "native"
  ) {
    return { ok: false, error: "You don't have permission to edit this agent." };
  }
  if (agent.deleted_at !== null) {
    return { ok: false, error: "This agent has been deleted." };
  }

  const { error: updateError } = await supabase
    .from("agents")
    .update({ model: parsed.data.model })
    .eq("id", agent.id);
  if (updateError) {
    console.error("updateAgentModelAction update failed", updateError);
    return { ok: false, error: "Could not update model. Try again." };
  }

  revalidatePath(`/workspace/agents/${agent.id}`);
  return { ok: true };
}

export type SoftDeleteResult =
  | { ok: true; agentId: string; agentName: string; departmentSlug: string }
  | { ok: false; error: string };

export async function softDeleteAgentAction(
  formData: FormData,
): Promise<SoftDeleteResult> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }

  const parsed = agentIdSchema.safeParse({
    agent_id: formData.get("agent_id"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid request." };
  }

  const { data: agent } = await supabase
    .from("agents")
    .select("id, name, created_by, is_template, type, deleted_at, departments(slug)")
    .eq("id", parsed.data.agent_id)
    .maybeSingle();
  // Owner-of-user-agent OR org-admin-of-template (Session 27).
  const isOrgAdmin = agent ? await isCurrentUserOrgAdmin() : false;
  const isOwnerOfUserAgent =
    !!agent && agent.created_by === user.id && agent.is_template === false;
  const isAdminOfTemplate =
    !!agent && agent.is_template === true && isOrgAdmin;
  if (
    !agent ||
    (!isOwnerOfUserAgent && !isAdminOfTemplate) ||
    agent.type !== "native"
  ) {
    return { ok: false, error: "You don't have permission to delete this agent." };
  }
  if (agent.deleted_at !== null) {
    return { ok: false, error: "This agent is already deleted." };
  }

  const { error: updateError } = await supabase
    .from("agents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", agent.id);
  if (updateError) {
    console.error("softDeleteAgentAction update failed", updateError);
    return { ok: false, error: "Could not delete agent. Try again." };
  }

  const departmentSlug =
    (agent.departments as unknown as { slug: string } | null)?.slug ?? "";
  revalidatePath(`/workspace/departments/${departmentSlug}`);
  revalidatePath("/workspace/agents/trash");

  return {
    ok: true,
    agentId: agent.id,
    agentName: agent.name,
    departmentSlug,
  };
}

export type RestoreResult =
  | { ok: true; agentId: string; departmentSlug: string }
  | { ok: false; error: string };

const RESTORE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function restoreAgentAction(
  formData: FormData,
): Promise<RestoreResult> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }

  const parsed = agentIdSchema.safeParse({
    agent_id: formData.get("agent_id"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid request." };
  }

  const { data: agent } = await supabase
    .from("agents")
    .select("id, created_by, is_template, type, deleted_at, departments(slug)")
    .eq("id", parsed.data.agent_id)
    .maybeSingle();
  // Owner-of-user-agent OR org-admin-of-template (Session 27). The
  // 30-day window check below applies uniformly — admins do not get
  // extended restore for templates.
  const isOrgAdmin = agent ? await isCurrentUserOrgAdmin() : false;
  const isOwnerOfUserAgent =
    !!agent && agent.created_by === user.id && agent.is_template === false;
  const isAdminOfTemplate =
    !!agent && agent.is_template === true && isOrgAdmin;
  if (
    !agent ||
    (!isOwnerOfUserAgent && !isAdminOfTemplate) ||
    agent.type !== "native"
  ) {
    return { ok: false, error: "You don't have permission to restore this agent." };
  }
  if (agent.deleted_at === null) {
    return { ok: false, error: "This agent is not deleted." };
  }

  const deletedAt = new Date(agent.deleted_at).getTime();
  if (Number.isNaN(deletedAt) || Date.now() - deletedAt > RESTORE_WINDOW_MS) {
    return {
      ok: false,
      error: "This agent is past the 30-day undo window.",
    };
  }

  const { error: updateError } = await supabase
    .from("agents")
    .update({ deleted_at: null })
    .eq("id", agent.id);
  if (updateError) {
    console.error("restoreAgentAction update failed", updateError);
    return { ok: false, error: "Could not restore agent. Try again." };
  }

  const departmentSlug =
    (agent.departments as unknown as { slug: string } | null)?.slug ?? "";
  revalidatePath(`/workspace/departments/${departmentSlug}`);
  revalidatePath("/workspace/agents/trash");

  return { ok: true, agentId: agent.id, departmentSlug };
}

/**
 * Zod schema for the create-template-agent form. Same shape as
 * `createAgentSchema` minus the fork-source field (templates aren't
 * forks of anything) and minus the pending-attachments path
 * (template-create from the launchpad doesn't carry attachments at v1;
 * admins can add them via the edit form post-creation).
 */
const createTemplateAgentSchema = z.object({
  agent_id: z.string().uuid(),
  department_slug: z.string().min(1),
  name: z.string().trim().min(1, "Name is required.").max(120, "Name is too long."),
  description: z.string().trim().max(500, "Description is too long.").optional(),
  system_prompt: z
    .string()
    .trim()
    .min(1, "System prompt is required.")
    .max(20000, "System prompt is too long."),
  model: z.enum(SUPPORTED_MODELS, { message: "Unsupported model." }),
  tool_web_search: z
    .string()
    .optional()
    .transform((v) => v === "on"),
});

/**
 * Create a Pattern B canonical template agent (Session 27, D-041 mirror-
 * RLS principle). Org-admin only — `isCurrentUserOrgAdmin()` gates the
 * app layer; the underlying RLS `agents_admin_write` policy gates the
 * DB layer.
 *
 * Templates differ from user-owned agents in two fields: `is_template`
 * is true, and `created_by` is null (canonical agents have no human
 * owner — they belong to the org). All other fields mirror the form
 * inputs identically to `createAgentAction`.
 */
export async function createTemplateAgentAction(
  _prev: AgentFormResult,
  formData: FormData,
): Promise<AgentFormResult> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, formError: "You must be signed in to create a template." };
  }

  const isOrgAdmin = await isCurrentUserOrgAdmin();
  if (!isOrgAdmin) {
    return { ok: false, formError: "You don't have permission to create department templates." };
  }

  const parsed = createTemplateAgentSchema.safeParse({
    agent_id: formData.get("agent_id"),
    department_slug: formData.get("department_slug"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    system_prompt: formData.get("system_prompt"),
    model: formData.get("model"),
    tool_web_search: formData.get("tool_web_search") || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: NonNullable<
      Extract<AgentFormResult, { ok: false }>["fieldErrors"]
    > = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<
        Extract<AgentFormResult, { ok: false }>["fieldErrors"]
      >;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const input = parsed.data;

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) {
    return { ok: false, formError: "Could not load your profile. Try signing in again." };
  }

  const { data: department } = await supabase
    .from("departments")
    .select("id, slug")
    .eq("slug", input.department_slug)
    .maybeSingle();
  if (!department) {
    return { ok: false, formError: "That department is not available." };
  }

  const toolsEnabled: string[] = input.tool_web_search ? ["web_search"] : [];

  const { error: insertError } = await supabase
    .from("agents")
    .insert({
      id: input.agent_id,
      organization_id: profile.organization_id,
      department_id: department.id,
      slug: generateSlug(input.name),
      name: input.name,
      description: input.description ?? null,
      type: "native" as const,
      system_prompt: input.system_prompt,
      model: input.model,
      sort_order: 0,
      is_active: true,
      is_template: true,
      forked_from_agent_id: null,
      tools_enabled: toolsEnabled,
      default_output_format: "markdown" as const,
      created_by: null,
    })
    .select("id")
    .single();
  if (insertError) {
    console.error("createTemplateAgentAction insert failed", {
      code: insertError.code,
    });
    return { ok: false, formError: "Could not create template. Try again." };
  }

  redirect(`/workspace/departments/${department.slug}`);
}

const forkFromConversationSchema = z.object({
  source_agent_id: z.string().uuid(),
  source_conversation_id: z.string().uuid().nullable(),
});

export type ForkFromConversationResult =
  | {
      ok: true;
      newAgentId: string;
      newConversationId: string | null;
      departmentSlug: string;
    }
  | { ok: false; error: string };

/**
 * Customize-this-template flow (Session 27, D-041 + Step A.2 Q3).
 * Creates a personal copy of a template and optionally copies a
 * conversation's messages into a fresh conversation under the new
 * agent.
 *
 * Steps:
 *   1. Validate inputs + auth.
 *   2. Load + validate source template (is_template, native, not deleted,
 *      caller has department access).
 *   3. INSERT the new agent (user-owned, is_template=false, forked_from
 *      points back at the source for provenance).
 *   4. If `source_conversation_id` is provided:
 *        a. Verify it belongs to the caller (RLS would also reject).
 *        b. INSERT a new conversation. system_prompt_snapshot /
 *           model_snapshot re-snapshot from the new agent (NOT preserved
 *           from source) per Step A.2 decision — the personal copy is a
 *           fresh start.
 *        c. SELECT source messages ordered by created_at.
 *        d. Bulk INSERT into messages, preserving source created_at
 *           for timeline coherence.
 *
 * Failure handling: best-effort rollback. If conversation or message
 * copy fails after agent insert, soft-delete the orphaned agent (set
 * deleted_at) — users have no DELETE policy on agents, so hard delete
 * via the user client isn't available. Soft-delete keeps the row out
 * of the launchpad and the user's trash can hard-delete it via the
 * existing 30-day window. Surface a soft error.
 */
export async function forkAgentFromConversationAction(
  formData: FormData,
): Promise<ForkFromConversationResult> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }

  const parsed = forkFromConversationSchema.safeParse({
    source_agent_id: formData.get("source_agent_id"),
    source_conversation_id: formData.get("source_conversation_id") || null,
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid request." };
  }
  const { source_agent_id, source_conversation_id } = parsed.data;

  // ---- Source template lookup + validation
  const { data: source } = await supabase
    .from("agents")
    .select(
      "id, organization_id, department_id, name, description, system_prompt, model, tools_enabled, default_output_format, type, is_template, is_active, deleted_at, departments(slug)",
    )
    .eq("id", source_agent_id)
    .maybeSingle();
  if (
    !source ||
    source.type !== "native" ||
    source.is_template !== true ||
    source.is_active !== true ||
    source.deleted_at !== null ||
    !source.system_prompt ||
    !source.model
  ) {
    return { ok: false, error: "That template is not available to customize." };
  }

  // ---- Department access (defense in depth — chat surface already
  // gates this on page load, but verify on action too).
  const { data: hasAccess } = await supabase.rpc("has_department_access", {
    dept_id: source.department_id,
  });
  if (!hasAccess) {
    return { ok: false, error: "You don't have access to this department." };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) {
    return { ok: false, error: "Could not load your profile. Try signing in again." };
  }

  const sourceTools = Array.isArray(source.tools_enabled)
    ? (source.tools_enabled as unknown as string[])
    : [];

  // ---- INSERT the new agent (user-owned copy of the template)
  const { data: newAgent, error: agentErr } = await supabase
    .from("agents")
    .insert({
      organization_id: profile.organization_id,
      department_id: source.department_id,
      slug: generateSlug(`${source.name} my copy`),
      name: `${source.name} (My Copy)`,
      description: source.description,
      type: "native" as const,
      system_prompt: source.system_prompt,
      model: source.model,
      sort_order: 0,
      is_active: true,
      is_template: false,
      forked_from_agent_id: source.id,
      tools_enabled: sourceTools,
      // Preserve the source's default output format. Today every Canonical
      // and C4L source uses markdown, so this is functionally a no-op —
      // but hardcoding "markdown" would silently flip the fork if a future
      // source ships with a different default. Caught during polish #12's
      // fork behavior verification.
      default_output_format: source.default_output_format ?? "markdown",
      created_by: user.id,
    })
    .select("id, system_prompt, model")
    .single();
  if (agentErr || !newAgent) {
    console.error("forkAgentFromConversationAction agent insert failed", {
      code: agentErr?.code,
    });
    return { ok: false, error: "Could not create your copy. Try again." };
  }

  const departmentSlug =
    (source.departments as unknown as { slug: string } | null)?.slug ?? "";

  // ---- If no source conversation, we're done — fresh fork.
  if (!source_conversation_id) {
    revalidatePath(`/workspace/departments/${departmentSlug}`);
    return {
      ok: true,
      newAgentId: newAgent.id,
      newConversationId: null,
      departmentSlug,
    };
  }

  // ---- Best-effort soft-delete rollback for any failure beyond this
  // point. Users have no DELETE policy on agents (migration 0010 is
  // UPDATE-only), so we soft-delete to keep the orphan out of the
  // launchpad. The 30-day trash window catches it for restoration or
  // eventual cron hard-delete.
  async function softDeleteOrphan(): Promise<void> {
    const { error } = await supabase
      .from("agents")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", newAgent!.id);
    if (error) {
      console.error("orphan soft-delete failed", { code: error.code });
    }
  }

  // ---- Verify source conversation ownership
  const { data: sourceConv } = await supabase
    .from("conversations")
    .select("id, user_id, agent_id, title")
    .eq("id", source_conversation_id)
    .maybeSingle();
  if (
    !sourceConv ||
    sourceConv.user_id !== user.id ||
    sourceConv.agent_id !== source.id
  ) {
    await softDeleteOrphan();
    return {
      ok: false,
      error: "Could not access the source conversation. Try again from the chat surface.",
    };
  }

  // ---- INSERT new conversation. Re-snapshot from the new agent
  // (per Step A.2 decision — personal copy is a fresh start, the
  // template snapshot is not preserved).
  const { data: newConv, error: convErr } = await supabase
    .from("conversations")
    .insert({
      organization_id: profile.organization_id,
      user_id: user.id,
      agent_id: newAgent.id,
      system_prompt_snapshot: newAgent.system_prompt,
      model_snapshot: newAgent.model,
      title: sourceConv.title,
    })
    .select("id")
    .single();
  if (convErr || !newConv) {
    console.error("forkAgentFromConversationAction conversation insert failed", {
      code: convErr?.code,
    });
    await softDeleteOrphan();
    return {
      ok: false,
      error: "We made your copy, but couldn't bring your conversation. Try again.",
    };
  }

  // ---- Copy messages. Bulk insert as one statement. Preserves source
  // created_at so the conversation's timeline reflects when the turns
  // actually happened.
  const { data: sourceMessages } = await supabase
    .from("messages")
    .select("role, content, tokens_in, tokens_out, sources, tool_calls, created_at")
    .eq("conversation_id", source_conversation_id)
    .order("created_at", { ascending: true });

  if (sourceMessages && sourceMessages.length > 0) {
    const messagePayload = sourceMessages.map((m) => ({
      conversation_id: newConv.id,
      role: m.role,
      content: m.content,
      tokens_in: m.tokens_in,
      tokens_out: m.tokens_out,
      sources: m.sources,
      tool_calls: m.tool_calls,
      created_at: m.created_at,
    }));
    const { error: msgErr } = await supabase
      .from("messages")
      .insert(messagePayload);
    if (msgErr) {
      console.error("forkAgentFromConversationAction message copy failed", {
        code: msgErr.code,
      });
      await softDeleteOrphan();
      return {
        ok: false,
        error: "We made your copy, but couldn't copy your conversation history. Try again.",
      };
    }
  }

  revalidatePath(`/workspace/departments/${departmentSlug}`);
  return {
    ok: true,
    newAgentId: newAgent.id,
    newConversationId: newConv.id,
    departmentSlug,
  };
}
