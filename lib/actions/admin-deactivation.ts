"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isCurrentUserOrgAdmin, isCurrentUserSuperAdmin } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Deactivate / reactivate a user (People area, A3b). Soft only: flips
 * `users.is_active` and nothing else. No cascade, fully reversible — the user's
 * agents, connections, grants, conversations, department roles, and audit rows
 * all remain, and return on reactivation. Access is enforced at the request layer
 * (proxy, auth callback, workspace layout), not here.
 *
 * The gating rule mirrors the A3a role-escalation rule, enforced in three layers
 * (mirror-RLS, D-041): the UI mirrors it honestly, this action re-checks it for
 * friendly errors, and the database trigger `enforce_user_deactivation`
 * (migration 0049) is the authoritative guard no crafted request can bypass.
 *
 *   - super_admin may deactivate/reactivate any user.
 *   - org_admin may deactivate/reactivate user and org_admin accounts, but not a
 *     super_admin.
 *   - The org's last ACTIVE super_admin cannot be deactivated (lockout
 *     protection), re-checked here regardless of any client confirmation.
 *   - Self-deactivation is allowed (the UI confirms it first); the last-active-
 *     super-admin guard still applies.
 *
 * The audit row (user_status_audit) is written by the trigger, NOT here, so every
 * committed status change is recorded exactly once (including direct SQL). The
 * file exports only this async function (no type exports) per D-072.
 */

type DeactivationResult = { ok: true } | { ok: false; error: string };

const updateSchema = z.object({
  target_user_id: z.string().uuid(),
  active: z.enum(["true", "false"]),
});

export async function setUserActiveAction(
  formData: FormData,
): Promise<DeactivationResult> {
  // 1. Authenticate + resolve the actor's authority.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const [actorIsOrgAdmin, actorIsSuperAdmin] = await Promise.all([
    isCurrentUserOrgAdmin(),
    isCurrentUserSuperAdmin(),
  ]);
  if (!actorIsOrgAdmin) {
    return { ok: false, error: "You don't have permission to do that." };
  }

  // 2. Validate input.
  const parsed = updateSchema.safeParse({
    target_user_id: formData.get("target_user_id"),
    active: formData.get("active"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { target_user_id } = parsed.data;
  const nextActive = parsed.data.active === "true";

  // 3. Resolve the actor's org, then load the target (same-org defense-in-depth).
  const { data: actorProfile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!actorProfile?.organization_id) {
    return { ok: false, error: "Could not resolve your organization." };
  }

  const { data: target } = await supabase
    .from("users")
    .select("id, organization_id, role, is_active")
    .eq("id", target_user_id)
    .maybeSingle();
  if (!target || target.organization_id !== actorProfile.organization_id) {
    return { ok: false, error: "Invalid request." };
  }

  // No-op: already in the requested state (nothing to change or audit).
  if (target.is_active === nextActive) return { ok: true };

  // 4. Separation of duties: only a super_admin may change a super_admin's status.
  if (!actorIsSuperAdmin && target.role === "super_admin") {
    return {
      ok: false,
      error: "Only a super admin can change a super admin's status.",
    };
  }

  // 5. Last-active-super-admin lockout protection. Refuse to deactivate the org's
  // only remaining active super_admin. Mirrors the trigger's count exactly:
  // count active super admins excluding the target, refuse when zero remain.
  if (!nextActive && target.role === "super_admin") {
    const { count, error: countError } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", actorProfile.organization_id)
      .eq("role", "super_admin")
      .eq("is_active", true)
      .neq("id", target_user_id);
    if (countError) {
      console.error("setUserActiveAction super-admin count failed", {
        code: countError.code,
      });
      return { ok: false, error: "Could not update the account. Try again." };
    }
    if ((count ?? 0) === 0) {
      return {
        ok: false,
        error: "Your organization must keep at least one active super admin.",
      };
    }
  }

  // 6. Write. RLS and the trigger re-enforce; the trigger also records the audit
  // row. A trigger rejection surfaces as a generic error (the friendly messages
  // above cover the expected cases; this is the crafted-request backstop).
  const { error: updateError } = await supabase
    .from("users")
    .update({ is_active: nextActive })
    .eq("id", target_user_id);
  if (updateError) {
    console.error("setUserActiveAction update failed", {
      code: updateError.code,
    });
    return { ok: false, error: "Could not update the account. Try again." };
  }

  // 7. Revalidate People (the roster) and the workspace shell (the target's
  // access changes immediately).
  revalidatePath("/workspace/admin/people");
  revalidatePath("/workspace/admin/users");
  revalidatePath("/workspace");
  return { ok: true };
}
