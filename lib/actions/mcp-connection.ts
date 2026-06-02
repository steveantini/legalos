"use server";

import { revalidatePath } from "next/cache";

import { isCurrentUserSuperAdmin } from "@/lib/auth/access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Super-admin server action for the MCP connector UI (flag 2c): disconnect a
 * connected MCP server. Mirrors clearBYOModelKey's all-or-nothing discipline —
 * delete the connection row (org-scoped, super-admin via RLS) and its stored
 * secret (the encrypted token bundle + registered-client info, service-role).
 *
 * The file exports only this async function (D-072). Idempotent: a no-op if there
 * is no active MCP connection for the server id. serverId is the connection's
 * provider_id (a first-party registry id or a 'self-hosted:<origin>' id); we do
 * not re-derive trust here because disconnecting is identity-scoped, not
 * trust-scoped, and removing any of the org's own MCP connections is permitted.
 */

type McpConnectionResult = { ok: true } | { ok: false; error: string };

export async function disconnectMcpServer(
  serverId: string,
): Promise<McpConnectionResult> {
  if (!(await isCurrentUserSuperAdmin())) {
    return { ok: false, error: "You don't have permission to do that." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("connections")
    .select("id, token_ref")
    .eq("scope", "org")
    .is("owner_user_id", null)
    .eq("provider_id", serverId)
    .eq("capability_category", "mcp")
    .eq("status", "active")
    .maybeSingle();

  if (!existing) {
    // Nothing connected; already in the desired state.
    return { ok: true };
  }

  const row = existing as { id: string; token_ref: string | null };
  const { error: deleteError } = await supabase
    .from("connections")
    .delete()
    .eq("id", row.id);
  if (deleteError) {
    console.error("mcp disconnect failed", { code: deleteError.code });
    return { ok: false, error: "Could not disconnect the server. Try again." };
  }

  // Remove the now-orphaned secret (service-role). Best-effort: the connection is
  // already gone, so the credentials are unreachable regardless.
  if (row.token_ref) {
    const admin = createSupabaseAdminClient();
    await admin.from("connection_secrets").delete().eq("id", row.token_ref);
  }

  revalidatePath("/workspace/admin/policy");
  return { ok: true };
}
