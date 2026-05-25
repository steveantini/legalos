"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isCurrentUserOrgAdmin } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server action result type for department description updates. Matches
 * the discriminated-union shape used by `lib/actions/agents.ts`'s
 * `AgentSettingResult` — kept domain-local rather than imported across
 * domains.
 */
export type DepartmentUpdateResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Max length for a department description. 280 chars — a reasonable
 * short-prose ceiling that keeps the description readable inside a
 * department card without forcing long wraps. Empty strings (after
 * trim) are written as null since the underlying column is nullable;
 * a blank-but-not-null value would render as an empty line on the card
 * which is worse UX than no description at all.
 */
const MAX_DESCRIPTION_LENGTH = 280;

const updateDepartmentDescriptionSchema = z.object({
  department_id: z.string().uuid(),
  description: z.string().trim().max(MAX_DESCRIPTION_LENGTH),
});

/**
 * Updates a department's description. Org-admin only (super_admin or
 * org_admin), matching the underlying RLS write policy
 * (`departments_org_admin_write`, migration 0001). dept_admin is
 * intentionally excluded — see `isCurrentUserOrgAdmin()` for the
 * rationale.
 *
 * RLS enforces the same role gate at the DB layer as a second line of
 * defense. `revalidatePath('/workspace')` after success so the
 * department grid re-renders with the new description.
 */
export async function updateDepartmentDescriptionAction(
  formData: FormData,
): Promise<DepartmentUpdateResult> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }

  const isOrgAdmin = await isCurrentUserOrgAdmin();
  if (!isOrgAdmin) {
    return { ok: false, error: "You don't have permission to edit this." };
  }

  const parsed = updateDepartmentDescriptionSchema.safeParse({
    department_id: formData.get("department_id"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid request." };
  }

  const description =
    parsed.data.description === "" ? null : parsed.data.description;

  const { error: updateError } = await supabase
    .from("departments")
    .update({ description })
    .eq("id", parsed.data.department_id);
  if (updateError) {
    // No PII per backend-security.md — only the Postgres error code.
    console.error("updateDepartmentDescriptionAction update failed", {
      code: updateError.code,
    });
    return { ok: false, error: "Could not update description. Try again." };
  }

  revalidatePath("/workspace");
  revalidatePath("/workspace/departments");
  return { ok: true };
}
