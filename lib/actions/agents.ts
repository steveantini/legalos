"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { MODEL_PRICING } from "@/lib/llm/pricing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server actions for the agent CRUD surface (Session 8f-A).
 *
 * All writes are RLS-scoped — the server-client carries the user's JWT and
 * the `agents_user_creates_own` policy from migration 0009 enforces
 * ownership and per-department access at the database layer.
 *
 * Edit (UPDATE) and soft-delete (UPDATE deleted_at) actions land in 8f-B
 * once the corresponding RLS policy ships.
 */

const SUPPORTED_MODELS = Object.keys(MODEL_PRICING) as [string, ...string[]];

/**
 * Zod schema for the create-agent form. Bounded fields (`model`) match
 * MODEL_PRICING so an unsupported id can't make it past validation. Free
 * fields (name, description, system_prompt) are length-bounded; the
 * backstop CHECK constraints in 0001 / 0006 / 0009 catch anything that
 * slips past.
 */
const createAgentSchema = z.object({
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
});

export type CreateAgentResult =
  | { ok: true }
  | {
      ok: false;
      formError?: string;
      fieldErrors?: Partial<Record<keyof z.infer<typeof createAgentSchema>, string>>;
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
    department_slug: formData.get("department_slug"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    system_prompt: formData.get("system_prompt"),
    model: formData.get("model"),
    forked_from_agent_id: formData.get("forked_from_agent_id") || undefined,
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

  const insertPayload = {
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

  redirect(`/departments/${department.slug}`);
}
