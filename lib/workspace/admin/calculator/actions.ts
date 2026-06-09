"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserProfile, isCurrentUserSuperAdmin } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { taskBookSchema } from "./types";

/**
 * Saves the org's productivity task book (Step A). Super-admin gated at the app
 * layer (mirror-RLS, D-041) and re-enforced by the table's super_admin write
 * policy. Validates the human-supplied assumptions with zod before the upsert;
 * the measured run volumes are never sent here (they are read live). One row per
 * org, keyed by organization_id.
 */
export async function saveTaskBookAction(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isCurrentUserSuperAdmin())) {
    return { ok: false, error: "Only a super admin can edit the task book." };
  }

  const profile = await getCurrentUserProfile();
  if (!profile?.organization_id) {
    return { ok: false, error: "You must be signed in." };
  }

  const parsed = taskBookSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Some values are invalid. Please check the inputs." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("productivity_task_book")
    .upsert(
      { organization_id: profile.organization_id, config: parsed.data } as never,
      { onConflict: "organization_id" },
    );

  if (error) {
    return { ok: false, error: "Could not save the task book. Please try again." };
  }

  revalidatePath("/workspace/admin/calculator");
  return { ok: true };
}
