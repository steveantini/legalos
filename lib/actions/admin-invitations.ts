"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isCurrentUserOrgAdmin, isCurrentUserSuperAdmin } from "@/lib/auth/access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveSiteUrl } from "@/lib/url/site-url";

/**
 * Invitation actions for the People area (A3c). An admin invites a person by
 * email with a chosen org role and department access; the invite email is sent
 * through Supabase's auth email via the service-role `inviteUserByEmail` (no new
 * email infrastructure). Acceptance is seamless — `ensure_user_provisioned`
 * (migration 0050) consumes the pending invite on first sign-in.
 *
 * The escalation rule is enforced in three layers (mirror-RLS, D-041): the UI
 * offers only allowed roles, these actions re-check, and the `enforce_invitation_role`
 * trigger (migration 0050) is the authoritative DB backstop — an org_admin can
 * never create or retarget an invite to super_admin. Because acceptance writes
 * users.role via INSERT (which the 0048 role trigger does not guard), validating
 * the role at invite CREATION is the primary escalation gate.
 *
 * Privileged Supabase auth-admin calls (invite, delete the unaccepted auth user)
 * use the service-role client; the invitation row writes go through the RLS-scoped
 * server client so RLS and the trigger apply with the actor's identity. The file
 * exports only async functions (no type exports) per D-072. Logs carry PG codes
 * only — never emails or tokens.
 */

type InvitationResult = { ok: true } | { ok: false; error: string };

/** App-side invite window. Resend refreshes it. */
const INVITE_EXPIRY_DAYS = 7;

const ORG_ROLES = ["user", "org_admin", "super_admin"] as const;

const createSchema = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(ORG_ROLES, { message: "Invalid role." }),
  department_ids: z.array(z.string().uuid()),
});

const idSchema = z.object({ invitation_id: z.string().uuid() });

/** Gate: signed in + at least org_admin. Returns the actor's authority + org. */
async function gateInviteActor(): Promise<
  | {
      supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
      orgId: string;
      isSuperAdmin: boolean;
    }
  | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const [isOrgAdmin, isSuperAdmin] = await Promise.all([
    isCurrentUserOrgAdmin(),
    isCurrentUserSuperAdmin(),
  ]);
  if (!isOrgAdmin) return { error: "You don't have permission to do that." };

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.organization_id) {
    return { error: "Could not resolve your organization." };
  }

  return { supabase, orgId: profile.organization_id as string, isSuperAdmin };
}

export async function createInvitationAction(
  formData: FormData,
): Promise<InvitationResult> {
  const gate = await gateInviteActor();
  if ("error" in gate) return { ok: false, error: gate.error };
  const { supabase, orgId, isSuperAdmin } = gate;

  const parsed = createSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
    department_ids: formData.getAll("department_id").map(String),
  });
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email and role." };
  }
  const email = parsed.data.email.toLowerCase();
  const { role, department_ids } = parsed.data;

  // Escalation rule: only a super_admin may invite a super_admin.
  if (role === "super_admin" && !isSuperAdmin) {
    return {
      ok: false,
      error: "Only a super admin can invite a super admin.",
    };
  }

  // Chosen departments must belong to the org and be active (defense-in-depth).
  if (department_ids.length > 0) {
    const { data: validDepts } = await supabase
      .from("departments")
      .select("id")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .in("id", department_ids);
    if (!validDepts || validDepts.length !== department_ids.length) {
      return { ok: false, error: "One of the selected departments is unavailable." };
    }
  }

  // Already a member? (Don't invite an existing user.)
  const { data: existingUser } = await supabase
    .from("users")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (existingUser) {
    return { ok: false, error: "That person is already in your organization." };
  }

  // Insert the invitation (actor-context client → RLS + role trigger apply).
  const expiresAt = new Date(
    Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: inserted, error: insertError } = await supabase
    .from("invitations")
    .insert({
      organization_id: orgId,
      email,
      role,
      department_ids,
      invited_by_user_id: user?.id ?? null,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    // 23505 = unique_violation on the partial pending index.
    if (insertError?.code === "23505") {
      return { ok: false, error: "That email already has a pending invitation." };
    }
    console.error("createInvitationAction insert failed", {
      code: insertError?.code,
    });
    return { ok: false, error: "Could not create the invitation. Try again." };
  }

  // Send the invite through Supabase's auth email (service-role).
  const admin = createSupabaseAdminClient();
  const { data: invited, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${resolveSiteUrl()}/auth/callback`,
    });
  if (inviteError) {
    // Roll back the row so we don't keep a pending invite that never sent.
    await supabase.from("invitations").delete().eq("id", inserted.id);
    console.error("inviteUserByEmail failed", { code: inviteError.code });
    return {
      ok: false,
      error: "Could not send the invitation email. Try again.",
    };
  }

  // Record the created auth user so revoke can free the email for re-invite.
  if (invited?.user?.id) {
    await supabase
      .from("invitations")
      .update({ auth_user_id: invited.user.id })
      .eq("id", inserted.id);
  }

  revalidatePath("/workspace/admin/people");
  return { ok: true };
}

/**
 * Load a pending invitation and gate the actor against it (same-org; only a
 * super_admin may act on a super_admin invite). Shared by resend and revoke.
 */
async function loadGatedPendingInvite(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  orgId: string,
  isSuperAdmin: boolean,
  invitationId: string,
): Promise<
  | { email: string; role: string; authUserId: string | null }
  | { error: string }
> {
  const { data: invite } = await supabase
    .from("invitations")
    .select("email, role, status, organization_id, auth_user_id")
    .eq("id", invitationId)
    .maybeSingle();
  if (!invite || invite.organization_id !== orgId) {
    return { error: "Invitation not found." };
  }
  if (invite.status !== "pending") {
    return { error: "This invitation is no longer pending." };
  }
  if (invite.role === "super_admin" && !isSuperAdmin) {
    return { error: "Only a super admin can manage a super admin invitation." };
  }
  return {
    email: invite.email as string,
    role: invite.role as string,
    authUserId: (invite.auth_user_id as string | null) ?? null,
  };
}

export async function resendInvitationAction(
  formData: FormData,
): Promise<InvitationResult> {
  const gate = await gateInviteActor();
  if ("error" in gate) return { ok: false, error: gate.error };
  const { supabase, orgId, isSuperAdmin } = gate;

  const parsed = idSchema.safeParse({
    invitation_id: formData.get("invitation_id"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const loaded = await loadGatedPendingInvite(
    supabase,
    orgId,
    isSuperAdmin,
    parsed.data.invitation_id,
  );
  if ("error" in loaded) return { ok: false, error: loaded.error };

  // Re-send the invite email and refresh the expiry window.
  const admin = createSupabaseAdminClient();
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    loaded.email,
    { redirectTo: `${resolveSiteUrl()}/auth/callback` },
  );
  if (inviteError) {
    console.error("resendInvitationAction invite failed", {
      code: inviteError.code,
    });
    return { ok: false, error: "Could not resend the invitation. Try again." };
  }

  const expiresAt = new Date(
    Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  await supabase
    .from("invitations")
    .update({ expires_at: expiresAt })
    .eq("id", parsed.data.invitation_id);

  revalidatePath("/workspace/admin/people");
  return { ok: true };
}

export async function revokeInvitationAction(
  formData: FormData,
): Promise<InvitationResult> {
  const gate = await gateInviteActor();
  if ("error" in gate) return { ok: false, error: gate.error };
  const { supabase, orgId, isSuperAdmin } = gate;

  const parsed = idSchema.safeParse({
    invitation_id: formData.get("invitation_id"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const loaded = await loadGatedPendingInvite(
    supabase,
    orgId,
    isSuperAdmin,
    parsed.data.invitation_id,
  );
  if ("error" in loaded) return { ok: false, error: loaded.error };

  const { error: updateError } = await supabase
    .from("invitations")
    .update({ status: "revoked" })
    .eq("id", parsed.data.invitation_id);
  if (updateError) {
    console.error("revokeInvitationAction update failed", {
      code: updateError.code,
    });
    return { ok: false, error: "Could not revoke the invitation. Try again." };
  }

  // Best-effort: delete the unaccepted invited auth user so the email can be
  // re-invited cleanly. Safe because a pending invite has no public.users row
  // (acceptance is what provisions one). Never touches an accepted/real user.
  if (loaded.authUserId) {
    const admin = createSupabaseAdminClient();
    const { error: deleteError } = await admin.auth.admin.deleteUser(
      loaded.authUserId,
    );
    if (deleteError) {
      console.error("revokeInvitationAction auth cleanup failed", {
        code: deleteError.code,
      });
      // Non-fatal: the invite is revoked (gate no longer admits it); the orphan
      // auth shell only blocks a future re-invite, which the admin can resolve.
    }
  }

  revalidatePath("/workspace/admin/people");
  return { ok: true };
}
