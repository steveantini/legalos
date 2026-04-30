"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

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
    tools_enabled: [],
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

  redirect(`/departments/${department.slug}`);
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
  const { data: agent } = await supabase
    .from("agents")
    .select("id, created_by, is_template, type")
    .eq("id", input.agent_id)
    .maybeSingle();
  if (
    !agent ||
    agent.created_by !== user.id ||
    agent.is_template === true ||
    agent.type !== "native"
  ) {
    return { ok: false, formError: "You don't have permission to edit this agent." };
  }

  const { error: updateError } = await supabase
    .from("agents")
    .update({
      name: input.name,
      description: input.description ?? null,
      system_prompt: input.system_prompt,
      model: input.model,
    })
    .eq("id", input.agent_id);
  if (updateError) {
    console.error("updateAgentAction update failed", updateError);
    return { ok: false, formError: "Could not save changes. Try again." };
  }

  redirect(`/agents/${input.agent_id}`);
}

const agentIdSchema = z.object({
  agent_id: z.string().uuid(),
});

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
  if (
    !agent ||
    agent.created_by !== user.id ||
    agent.is_template === true ||
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
  revalidatePath(`/departments/${departmentSlug}`);
  revalidatePath("/agents/trash");

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
  if (
    !agent ||
    agent.created_by !== user.id ||
    agent.is_template === true ||
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
  revalidatePath(`/departments/${departmentSlug}`);
  revalidatePath("/agents/trash");

  return { ok: true, agentId: agent.id, departmentSlug };
}
