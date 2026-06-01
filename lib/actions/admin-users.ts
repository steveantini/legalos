"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isCurrentUserOrgAdmin } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server actions for the Session 29 admin User access page.
 *
 * Four actions, two pairs:
 *
 *   - grantDepartmentAccessAction / revokeDepartmentAccessAction —
 *     manipulate a specific (user, department) row in
 *     `user_department_roles`. Default role on grant is 'user' (plain
 *     access, not elevated to dept_admin).
 *   - addDefaultDepartmentAction / removeDefaultDepartmentAction —
 *     manipulate the org's `organization_default_departments` set.
 *     These affect what new users receive at first provisioning per
 *     migration 0021's extension to `ensure_user_provisioned`;
 *     existing users are unaffected.
 *
 * All four actions:
 *   - Gate on `isCurrentUserOrgAdmin()` (mirror-RLS principle D-041 —
 *     RLS write policies admit org-admins, the app-layer gate matches).
 *   - Validate inputs with Zod schemas at the trust boundary.
 *   - Verify referenced user_id / department_id belong to the caller's
 *     organization as defense-in-depth (RLS would reject cross-org
 *     writes, but the explicit check returns a clean error rather
 *     than relying on an RLS-denied insert that surfaces as a generic
 *     PG error).
 *   - Log only the PG error code on failure (no PII per
 *     backend-security.md).
 *   - Return a discriminated-union result matching
 *     `lib/actions/departments.ts`'s shape.
 *   - revalidatePath('/workspace/admin/people') and the legacy
 *     '/workspace/admin/users' so both admin surfaces re-render with
 *     fresh server data (People is the A3 replacement; the old Users
 *     page stays reachable until People fully supersedes it). Grant /
 *     revoke also revalidate '/workspace' so the user's rail + landing
 *     reflect the change on their next request.
 */

export type AdminUsersResult = { ok: true } | { ok: false; error: string };

const grantOrRevokeSchema = z.object({
  user_id: z.string().uuid(),
  department_id: z.string().uuid(),
});

const departmentOnlySchema = z.object({
  department_id: z.string().uuid(),
});

/**
 * Compose: getUser + isOrgAdmin + resolve caller's organization_id.
 * Returns either `{ orgId, supabase }` for downstream queries or
 * `{ error }` to short-circuit. Centralizing the gate keeps each
 * action's body focused on its specific mutation.
 */
async function gateOrgAdmin(): Promise<
  | {
      orgId: string;
      supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
    }
  | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  if (!(await isCurrentUserOrgAdmin())) {
    return { error: "You don't have permission to do that." };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.organization_id) {
    return { error: "Could not resolve your organization." };
  }

  return { orgId: profile.organization_id as string, supabase };
}

/**
 * Verify that both the target user and target department belong to the
 * caller's organization. RLS would reject cross-org writes anyway, but
 * the explicit check returns a clean validation error rather than a
 * generic insert/delete failure.
 */
async function verifySameOrg(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  orgId: string,
  userId: string,
  departmentId: string,
): Promise<boolean> {
  const [userCheck, deptCheck] = await Promise.all([
    supabase
      .from("users")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("departments")
      .select("organization_id")
      .eq("id", departmentId)
      .maybeSingle(),
  ]);
  return (
    userCheck.data?.organization_id === orgId &&
    deptCheck.data?.organization_id === orgId
  );
}

export async function grantDepartmentAccessAction(
  formData: FormData,
): Promise<AdminUsersResult> {
  const gate = await gateOrgAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };

  const parsed = grantOrRevokeSchema.safeParse({
    user_id: formData.get("user_id"),
    department_id: formData.get("department_id"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const ok = await verifySameOrg(
    gate.supabase,
    gate.orgId,
    parsed.data.user_id,
    parsed.data.department_id,
  );
  if (!ok) return { ok: false, error: "Invalid request." };

  // Default role on grant is 'user' (plain access). Elevating to
  // dept_admin is a separate operation deliberately out of scope for
  // the Session 29 access-management UI.
  const { error } = await gate.supabase
    .from("user_department_roles")
    .upsert(
      {
        user_id: parsed.data.user_id,
        department_id: parsed.data.department_id,
        role: "user",
      },
      { onConflict: "user_id,department_id", ignoreDuplicates: true },
    );

  if (error) {
    console.error("grantDepartmentAccessAction failed", { code: error.code });
    return { ok: false, error: "Could not grant access. Try again." };
  }

  revalidatePath("/workspace/admin/people");
  revalidatePath("/workspace/admin/users");
  revalidatePath("/workspace");
  revalidatePath("/workspace/departments");
  return { ok: true };
}

export async function revokeDepartmentAccessAction(
  formData: FormData,
): Promise<AdminUsersResult> {
  const gate = await gateOrgAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };

  const parsed = grantOrRevokeSchema.safeParse({
    user_id: formData.get("user_id"),
    department_id: formData.get("department_id"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const ok = await verifySameOrg(
    gate.supabase,
    gate.orgId,
    parsed.data.user_id,
    parsed.data.department_id,
  );
  if (!ok) return { ok: false, error: "Invalid request." };

  const { error } = await gate.supabase
    .from("user_department_roles")
    .delete()
    .eq("user_id", parsed.data.user_id)
    .eq("department_id", parsed.data.department_id);

  if (error) {
    console.error("revokeDepartmentAccessAction failed", { code: error.code });
    return { ok: false, error: "Could not revoke access. Try again." };
  }

  revalidatePath("/workspace/admin/people");
  revalidatePath("/workspace/admin/users");
  revalidatePath("/workspace");
  revalidatePath("/workspace/departments");
  return { ok: true };
}

export async function addDefaultDepartmentAction(
  formData: FormData,
): Promise<AdminUsersResult> {
  const gate = await gateOrgAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };

  const parsed = departmentOnlySchema.safeParse({
    department_id: formData.get("department_id"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  // Defense-in-depth: the department belongs to the caller's org.
  const { data: dept } = await gate.supabase
    .from("departments")
    .select("organization_id")
    .eq("id", parsed.data.department_id)
    .maybeSingle();
  if (dept?.organization_id !== gate.orgId) {
    return { ok: false, error: "Invalid request." };
  }

  const { error } = await gate.supabase
    .from("organization_default_departments")
    .upsert(
      {
        organization_id: gate.orgId,
        department_id: parsed.data.department_id,
      },
      {
        onConflict: "organization_id,department_id",
        ignoreDuplicates: true,
      },
    );

  if (error) {
    console.error("addDefaultDepartmentAction failed", { code: error.code });
    return { ok: false, error: "Could not add default. Try again." };
  }

  revalidatePath("/workspace/admin/people");
  revalidatePath("/workspace/admin/users");
  return { ok: true };
}

export async function removeDefaultDepartmentAction(
  formData: FormData,
): Promise<AdminUsersResult> {
  const gate = await gateOrgAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };

  const parsed = departmentOnlySchema.safeParse({
    department_id: formData.get("department_id"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const { error } = await gate.supabase
    .from("organization_default_departments")
    .delete()
    .eq("organization_id", gate.orgId)
    .eq("department_id", parsed.data.department_id);

  if (error) {
    console.error("removeDefaultDepartmentAction failed", { code: error.code });
    return { ok: false, error: "Could not remove default. Try again." };
  }

  revalidatePath("/workspace/admin/people");
  revalidatePath("/workspace/admin/users");
  return { ok: true };
}
