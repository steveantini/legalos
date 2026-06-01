"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isCurrentUserOrgAdmin, isCurrentUserSuperAdmin } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Role-change server action for the People area (A3a).
 *
 * Changes a user's ORG role (users.role). The escalation rule is enforced in
 * THREE layers (mirror-RLS, D-041): the UI mirrors it honestly, this action
 * re-checks it for friendly errors, and the database trigger
 * `enforce_user_role_change` (migration 0048) is the authoritative guard that no
 * crafted request can bypass. This action's checks are defense-in-depth and the
 * source of human-readable messages; the trigger is the guarantee.
 *
 * The rule:
 *   - super_admin may set any user to any role.
 *   - org_admin may manage user <-> org_admin only; may not grant super_admin and
 *     may not modify a user who is currently super_admin.
 *   - The org's last super_admin cannot be demoted (lockout protection).
 *   - Self-demotion from super_admin is allowed (the UI confirms it first); the
 *     last-super-admin guard still applies and is re-checked here.
 *
 * The audit row is written by the trigger, NOT here, so every committed role
 * change is recorded exactly once (including direct SQL) and this action never
 * double-writes. The file exports only this async function (no type exports) per
 * D-072; the local result type is erased and the action's return type flows to
 * the caller via inference.
 */

type RoleChangeResult = { ok: true } | { ok: false; error: string };

const ORG_ROLES = ["user", "org_admin", "super_admin"] as const;

const updateSchema = z.object({
  target_user_id: z.string().uuid(),
  new_role: z.enum(ORG_ROLES, { message: "Invalid role." }),
});

export async function updateUserRoleAction(
  formData: FormData,
): Promise<RoleChangeResult> {
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
    new_role: formData.get("new_role"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { target_user_id, new_role } = parsed.data;

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
    .select("id, organization_id, role")
    .eq("id", target_user_id)
    .maybeSingle();
  if (!target || target.organization_id !== actorProfile.organization_id) {
    return { ok: false, error: "Invalid request." };
  }

  const currentRole = target.role as (typeof ORG_ROLES)[number];

  // No-op: nothing to change (and nothing to audit).
  if (currentRole === new_role) return { ok: true };

  // 4. Enforce the escalation rule (mirrors the trigger for a friendly message).
  if (!actorIsSuperAdmin) {
    // Actor is org_admin only.
    if (new_role === "super_admin") {
      return {
        ok: false,
        error: "Only a super admin can grant the super admin role.",
      };
    }
    if (currentRole === "super_admin") {
      return {
        ok: false,
        error: "Only a super admin can change a super admin's role.",
      };
    }
  }

  // 5. Last-active-super-admin lockout protection (re-checked server-side
  // regardless of any client confirmation). A demotion away from super_admin is
  // refused when no OTHER active super_admin remains. This mirrors the role
  // trigger's tightened count (migration 0049) exactly: count the org's active
  // super admins excluding the target, and refuse when that is zero. The
  // `is_active` filter is the A3b coupling fix — a deactivated super_admin does
  // not count as a protector against org lockout.
  if (currentRole === "super_admin" && new_role !== "super_admin") {
    const { count, error: countError } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", actorProfile.organization_id)
      .eq("role", "super_admin")
      .eq("is_active", true)
      .neq("id", target_user_id);
    if (countError) {
      console.error("updateUserRoleAction super-admin count failed", {
        code: countError.code,
      });
      return { ok: false, error: "Could not change the role. Try again." };
    }
    if ((count ?? 0) === 0) {
      return {
        ok: false,
        error: "Your organization must keep at least one active super admin.",
      };
    }
  }

  // 6. Write. RLS and the trigger re-enforce; the trigger also records the audit
  // row. A trigger rejection surfaces here as a generic error (the friendly
  // messages above cover the expected cases; this is the crafted-request backstop).
  const { error: updateError } = await supabase
    .from("users")
    .update({ role: new_role })
    .eq("id", target_user_id);
  if (updateError) {
    console.error("updateUserRoleAction update failed", {
      code: updateError.code,
    });
    return { ok: false, error: "Could not change the role. Try again." };
  }

  // 7. Revalidate People (the roster) and the workspace shell (the target's
  // admin access and the rail/profile mode switcher depend on their role).
  revalidatePath("/workspace/admin/people");
  revalidatePath("/workspace");
  return { ok: true };
}
