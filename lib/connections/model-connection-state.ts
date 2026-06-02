import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Read the org's current model-connection state for a vendor (flag 1d), for the
 * Policy & access surface to show on load.
 *
 * Service-role read: an org model connection is grant-less and thus
 * super-admin-read-only under RLS (connections_read_visible), so reading via the
 * service-role client lets the page show the state to ANY admin (super-admin or
 * not), consistent with how the connection policy renders read-only for
 * non-super-admins. Only the non-sensitive masked hint
 * (provider_account_label, the key's last 4) is returned — never the key.
 *
 * Returns null when the org has no model connection for the vendor (the default
 * managed state, nothing stored). A returned row distinguishes:
 *   - credentialSource 'byo'     → the org's own key is active.
 *   - credentialSource 'managed' → switched back to managed, the key retained.
 * In both cases maskedHint reflects the stored key.
 *
 * Tolerant of the feature being absent (pre-migration columns or any error) →
 * null, so the page degrades to the managed default rather than erroring.
 */
export type OrgModelConnectionState = {
  credentialSource: "managed" | "byo";
  maskedHint: string | null;
};

export async function getOrgModelConnectionState(
  vendor: string,
): Promise<OrgModelConnectionState | null> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("connections")
      .select("credential_source, provider_account_label")
      .eq("scope", "org")
      .is("owner_user_id", null)
      .eq("provider_id", vendor)
      .eq("capability_category", "models")
      .eq("status", "active")
      .maybeSingle();
    if (error || !data) return null;

    const row = data as {
      credential_source: string | null;
      provider_account_label: string | null;
    };
    if (row.credential_source !== "managed" && row.credential_source !== "byo") {
      return null;
    }
    return {
      credentialSource: row.credential_source,
      maskedHint: row.provider_account_label,
    };
  } catch {
    return null;
  }
}
