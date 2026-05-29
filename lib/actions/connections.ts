"use server";

import { revalidatePath } from "next/cache";

import { CONNECTIONS_PAGE_PATH } from "@/lib/connections/base-url";
import { requireAuthUser } from "@/lib/auth/access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Disconnect a personal connection.
 *
 * Bound to the Disconnect form on a connected provider row, so the signature is
 * the form-action shape (FormData → void) used by the login actions, not the
 * `{ ok }` discriminated union; the page re-renders from revalidated state
 * rather than a returned value.
 *
 * Removes everything the connection owns and leaves no orphan:
 *   - the connection row (its cascade removes the grant), via the user's
 *     RLS-scoped client, which only authorizes the owner (defense in depth on
 *     top of the explicit owner re-check);
 *   - the encrypted token in connection_secrets (service role), so no token
 *     outlives the connection.
 *
 * The connection is deleted before the secret on purpose: a leftover secret
 * with no reference is a harmless orphan blob, whereas a live connection whose
 * token was already deleted would be a broken, tokenless connection.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function disconnectConnectionAction(formData: FormData) {
  const connectionId = String(formData.get("connectionId") ?? "");
  if (!UUID_RE.test(connectionId)) {
    return;
  }

  const user = await requireAuthUser();
  const supabase = await createSupabaseServerClient();

  // Load to confirm ownership and capture token_ref. RLS already restricts the
  // visible rows; the explicit owner check ensures only the owner disconnects.
  const { data: connection } = await supabase
    .from("connections")
    .select("id, owner_user_id, token_ref")
    .eq("id", connectionId)
    .maybeSingle();

  const row = connection as
    | { id: string; owner_user_id: string | null; token_ref: string | null }
    | null;

  if (!row || row.owner_user_id !== user.id) {
    revalidatePath(CONNECTIONS_PAGE_PATH);
    return;
  }

  const { error: deleteError } = await supabase
    .from("connections")
    .delete()
    .eq("id", connectionId);
  if (deleteError) {
    revalidatePath(CONNECTIONS_PAGE_PATH);
    return;
  }

  if (row.token_ref) {
    const admin = createSupabaseAdminClient();
    await admin.from("connection_secrets").delete().eq("id", row.token_ref);
  }

  revalidatePath(CONNECTIONS_PAGE_PATH);
}
