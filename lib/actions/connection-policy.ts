"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  KNOWN_CATEGORY_IDS,
  deriveAllowedProviders,
} from "@/lib/connections/policy-derivation";
import { isCurrentUserSuperAdmin } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server action for the admin Policy & access editor (A2). Writes the singleton
 * `connection_policy` row that the connector layer enforces against (D-066 close).
 *
 * Authorization is super-admin only, gated FIRST with `isCurrentUserSuperAdmin()`
 * — NOT `isCurrentUserOrgAdmin()` — to mirror the write RLS
 * (`connection_policy_super_admin_write`, migration 0044). RLS re-enforces at the
 * DB layer, so this is defense-in-depth, not the sole gate.
 *
 * The client sends only the two things the super-admin edits: whether write is
 * allowed (the capability ceiling) and which categories are permitted. Both
 * `allowed_providers` and the ceiling array are computed here, server-side, so a
 * malformed or hostile client can never strand a provider or grant a capability
 * above `read`/`write`:
 *   - default_capability_ceiling = ['read'] or ['read','write'] (always read)
 *   - allowed_providers          = deriveAllowedProviders(allowed_categories)
 *
 * Discriminated-union result mirrors `lib/actions/admin-users.ts`. The file
 * exports only this async function (no type exports) per D-072. Local result and
 * input types are erased; the action's return type still flows to the caller via
 * inference on the import.
 */

type ConnectionPolicyResult = { ok: true } | { ok: false; error: string };

const POLICY_ID = 1;

const updateSchema = z.object({
  // The ceiling reduces to a single decision: is write permitted on top of read?
  allowWrite: z.boolean(),
  // Category ids must all be known registry categories; unknown ids are rejected
  // rather than silently written, so the stored policy stays in the vocabulary
  // the enforcement layer and registry share.
  categories: z.array(z.enum(KNOWN_CATEGORY_IDS as [string, ...string[]])),
});

export async function updateConnectionPolicyAction(
  formData: FormData,
): Promise<ConnectionPolicyResult> {
  // 1. Authorize first — super-admin only (mirror-RLS).
  if (!(await isCurrentUserSuperAdmin())) {
    return { ok: false, error: "You don't have permission to do that." };
  }

  // 2. Validate the minimal client input.
  const parsed = updateSchema.safeParse({
    allowWrite: formData.get("allow_write") === "1",
    categories: formData.getAll("category").map(String),
  });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  // 3. Derive the stored shape server-side (never trust the client for these).
  const ceiling = parsed.data.allowWrite ? ["read", "write"] : ["read"];
  const allowedCategories = KNOWN_CATEGORY_IDS.filter((id) =>
    parsed.data.categories.includes(id),
  );
  const allowedProviders = deriveAllowedProviders(allowedCategories);

  // 4. Write the singleton. RLS re-checks super_admin; updated_by stamps the actor.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("connection_policy")
    .update({
      default_capability_ceiling: ceiling,
      allowed_categories: allowedCategories,
      allowed_providers: allowedProviders,
      updated_by_user_id: user?.id ?? null,
    })
    .eq("id", POLICY_ID);

  if (error) {
    console.error("updateConnectionPolicyAction failed", { code: error.code });
    return { ok: false, error: "Could not save the policy. Try again." };
  }

  // 5. Revalidate the policy page so its next render re-reads the saved row.
  // (getConnectionPolicy's cache() is per-request only, so enforcement reads on
  // other surfaces already see fresh policy on their next request.)
  revalidatePath("/workspace/admin/policy");
  return { ok: true };
}
