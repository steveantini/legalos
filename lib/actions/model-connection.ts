"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { encryptApiKey } from "@/lib/connections/crypto";
import { getModelAdapter } from "@/lib/connections/providers/model-registry";
import { isCurrentUserSuperAdmin } from "@/lib/auth/access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Super-admin server actions for bring-your-own-key model connections (flag 1c,
 * D-087). The Policy & access "model connection" control (1d) calls these; 1c is
 * the backend only.
 *
 * A BYO model connection is an org-scoped connections row (scope='org',
 * owner_user_id null, provider_id=<vendor>, capability_category='models',
 * token_ref → an encrypted key in connection_secrets, credential_source='byo').
 * The unique partial index (migration 0051) guarantees at most one active org
 * model connection per vendor.
 *
 * Authorization is super-admin only, gated FIRST with isCurrentUserSuperAdmin()
 * to mirror the write RLS (connections_org_super_admin_write — scope='org' AND
 * super_admin, migration 0044); RLS re-enforces at the DB layer, so this is
 * defense-in-depth, not the sole gate. The encrypted secret is written via the
 * service-role admin client (connection_secrets is RLS-forced with no policies);
 * the connection row is written via the RLS-scoped server client so RLS re-checks
 * super_admin.
 *
 * The key never leaves the server: it is validated against the provider, stored
 * encrypted, and only a masked hint (last 4 chars) is retained for display. The
 * raw key is never returned to the client and never logged. The file exports
 * only async functions (D-072).
 */

type ModelConnectionResult =
  | { ok: true; maskedHint?: string }
  | { ok: false; error: string };

/** A non-sensitive display hint: the last 4 characters, e.g. "…AB12". Never the full key. */
function maskKeyHint(apiKey: string): string {
  return `…${apiKey.slice(-4)}`;
}

const setKeySchema = z.object({
  // Vendor must be a registered model provider (validated against the registry below).
  vendor: z.string().min(1),
  apiKey: z.string().min(1, "Enter a key."),
  // Optional self-hosted/custom endpoint; empty string is treated as no override.
  baseUrl: z.string().url().optional(),
});

/**
 * Store (or replace) the org's bring-your-own key for a vendor. Validates the key
 * against the provider before storing; rejects an invalid key rather than saving
 * it. Replacing an existing active connection rolls the old secret.
 */
export async function setBYOModelKey(input: {
  vendor: string;
  apiKey: string;
  baseUrl?: string;
}): Promise<ModelConnectionResult> {
  // 1. Authorize first — super-admin only (mirror-RLS).
  if (!(await isCurrentUserSuperAdmin())) {
    return { ok: false, error: "You don't have permission to do that." };
  }

  // 2. Validate input. Normalize an empty base URL to undefined.
  const parsed = setKeySchema.safeParse({
    vendor: input.vendor,
    apiKey: input.apiKey,
    baseUrl: input.baseUrl ? input.baseUrl : undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid key (and base URL, if used)." };
  }
  const { vendor, apiKey, baseUrl } = parsed.data;

  // 3. The vendor must be a known model provider with key validation.
  const adapter = getModelAdapter(vendor);
  if (!adapter) {
    return { ok: false, error: "That model provider isn't available." };
  }

  // 4. Validate the key against the provider BEFORE storing anything.
  const validation = await adapter.validateCredential({
    apiKey,
    ...(baseUrl ? { baseURL: baseUrl } : {}),
  });
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  // 5. Store the encrypted key first (service-role; rollback target on failure).
  const admin = createSupabaseAdminClient();
  let newSecretId: string;
  try {
    const { data, error } = await admin
      .from("connection_secrets")
      .insert({ ciphertext: encryptApiKey(apiKey) })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("no secret id returned");
    newSecretId = data.id as string;
  } catch (err) {
    console.error("byo model key secret store failed", {
      vendor,
      code: errorCode(err),
    });
    return { ok: false, error: "Could not save the key. Try again." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 6. Replace an existing active org model connection for the vendor, or create
  //    one. Updating (rather than inserting a second row) respects the unique
  //    partial index and keeps the connection's identity stable.
  const { data: existing } = await supabase
    .from("connections")
    .select("id, token_ref")
    .eq("scope", "org")
    .is("owner_user_id", null)
    .eq("provider_id", vendor)
    .eq("capability_category", "models")
    .eq("status", "active")
    .maybeSingle();

  const hint = maskKeyHint(apiKey);
  const connectionFields = {
    token_ref: newSecretId,
    credential_source: "byo" as const,
    base_url: baseUrl ?? null,
    provider_account_label: hint,
    status: "active" as const,
  };

  if (existing) {
    const oldSecretId = (existing as { id: string; token_ref: string | null })
      .token_ref;
    const { error: updateError } = await supabase
      .from("connections")
      .update(connectionFields)
      .eq("id", (existing as { id: string }).id);
    if (updateError) {
      // Roll back the orphaned new secret.
      await admin.from("connection_secrets").delete().eq("id", newSecretId);
      console.error("byo model connection update failed", {
        vendor,
        code: updateError.code,
      });
      return { ok: false, error: "Could not save the key. Try again." };
    }
    // Roll the old secret now that the connection points at the new one.
    if (oldSecretId && oldSecretId !== newSecretId) {
      await admin.from("connection_secrets").delete().eq("id", oldSecretId);
    }
  } else {
    const { error: insertError } = await supabase.from("connections").insert({
      provider_id: vendor,
      capability_category: "models",
      scope: "org",
      owner_user_id: null,
      created_by_user_id: user?.id ?? null,
      ...connectionFields,
    });
    if (insertError) {
      await admin.from("connection_secrets").delete().eq("id", newSecretId);
      console.error("byo model connection insert failed", {
        vendor,
        code: insertError.code,
      });
      return { ok: false, error: "Could not save the key. Try again." };
    }
  }

  revalidatePath("/workspace/admin/policy");
  return { ok: true, maskedHint: hint };
}

/**
 * Switch the org back to the managed platform key for a vendor, NON-destructively:
 * the connection row and its stored key are retained (credential_source flips to
 * 'managed'), so the org can switch back to BYO without re-entering the key. The
 * resolver then falls back to managed (it treats only credential_source='byo' as
 * BYO). Idempotent: a no-op if there is no model connection for the vendor.
 */
export async function switchToManaged(
  vendor: string,
): Promise<ModelConnectionResult> {
  if (!(await isCurrentUserSuperAdmin())) {
    return { ok: false, error: "You don't have permission to do that." };
  }
  if (!getModelAdapter(vendor)) {
    return { ok: false, error: "That model provider isn't available." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("connections")
    .update({ credential_source: "managed" })
    .eq("scope", "org")
    .is("owner_user_id", null)
    .eq("provider_id", vendor)
    .eq("capability_category", "models")
    .eq("status", "active");
  if (error) {
    console.error("switch to managed failed", { vendor, code: error.code });
    return { ok: false, error: "Could not switch to the managed key. Try again." };
  }

  revalidatePath("/workspace/admin/policy");
  return { ok: true };
}

/**
 * Forget the org's BYO key for a vendor entirely: delete the connection row and
 * its stored secret (destructive). Mirrors the all-or-nothing discipline.
 * Idempotent: a no-op if there is no model connection for the vendor.
 */
export async function clearBYOModelKey(
  vendor: string,
): Promise<ModelConnectionResult> {
  if (!(await isCurrentUserSuperAdmin())) {
    return { ok: false, error: "You don't have permission to do that." };
  }
  if (!getModelAdapter(vendor)) {
    return { ok: false, error: "That model provider isn't available." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("connections")
    .select("id, token_ref")
    .eq("scope", "org")
    .is("owner_user_id", null)
    .eq("provider_id", vendor)
    .eq("capability_category", "models")
    .eq("status", "active")
    .maybeSingle();

  if (!existing) {
    // Nothing stored; already in the desired state.
    return { ok: true };
  }

  const row = existing as { id: string; token_ref: string | null };
  const { error: deleteError } = await supabase
    .from("connections")
    .delete()
    .eq("id", row.id);
  if (deleteError) {
    console.error("clear byo model key failed", {
      vendor,
      code: deleteError.code,
    });
    return { ok: false, error: "Could not remove the key. Try again." };
  }

  // Remove the now-orphaned secret (service-role). Best-effort: the connection
  // is already gone, so the key is unreachable regardless.
  if (row.token_ref) {
    const admin = createSupabaseAdminClient();
    await admin.from("connection_secrets").delete().eq("id", row.token_ref);
  }

  revalidatePath("/workspace/admin/policy");
  return { ok: true };
}

/** Extract a PostgREST/JS error code for logging, never the underlying message. */
function errorCode(err: unknown): string | undefined {
  return err && typeof err === "object" && "code" in err
    ? (err as { code?: string }).code
    : undefined;
}
