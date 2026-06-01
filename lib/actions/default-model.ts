"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isCurrentUserSuperAdmin } from "@/lib/auth/access";
import { SUPPORTED_MODEL_IDS } from "@/lib/llm/models";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server action for the admin Policy & access default-model control (A2b).
 * Writes `organizations.default_model` — the model new agents start with.
 *
 * Authorization is super-admin only, gated FIRST with `isCurrentUserSuperAdmin()`
 * to mirror the write RLS on `organizations` (`organizations_super_admin_write`,
 * migration 0001). RLS re-enforces at the DB layer, so this is defense-in-depth,
 * not the sole gate. The org default is governance and cost-shaping (Opus costs
 * ~1.7x Sonnet), so it sits at the same super-admin tier as the connection policy.
 *
 * The model is validated against the canonical models source (lib/llm/models.ts),
 * the same set the agent-form validation accepts, so a malformed or hostile
 * client can never store an unsupported id. The write affects new agents only —
 * existing agents and running conversations keep their model (run path unchanged).
 *
 * The file exports only this async function (no type exports) per D-072. The
 * local result type is erased; the action's return type still flows to the
 * caller via inference on the import.
 */

type DefaultModelResult = { ok: true } | { ok: false; error: string };

const updateSchema = z.object({
  model: z.enum(SUPPORTED_MODEL_IDS as [string, ...string[]], {
    message: "Unsupported model.",
  }),
});

export async function updateDefaultModelAction(
  formData: FormData,
): Promise<DefaultModelResult> {
  // 1. Authorize first — super-admin only (mirror-RLS).
  if (!(await isCurrentUserSuperAdmin())) {
    return { ok: false, error: "You don't have permission to do that." };
  }

  // 2. Validate the model against the canonical source.
  const parsed = updateSchema.safeParse({ model: formData.get("model") });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  // 3. Resolve the caller's org, then write its default_model. RLS re-checks
  // super_admin and scopes the row to the caller's organization.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) {
    return { ok: false, error: "Could not load your profile. Try again." };
  }

  const { error } = await supabase
    .from("organizations")
    .update({ default_model: parsed.data.model })
    .eq("id", profile.organization_id);

  if (error) {
    console.error("updateDefaultModelAction failed", { code: error.code });
    return { ok: false, error: "Could not save the default model. Try again." };
  }

  // 4. Revalidate the policy page so its next render re-reads the saved value.
  revalidatePath("/workspace/admin/policy");
  return { ok: true };
}
