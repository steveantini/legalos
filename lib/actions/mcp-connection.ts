"use server";

import { revalidatePath } from "next/cache";

import { isCurrentUserSuperAdmin } from "@/lib/auth/access";
import { listMcpServerTools } from "@/lib/connections/mcp/client";
import { getUsableAccessToken } from "@/lib/connections/tokens";
import type { McpToolDescriptor } from "@/lib/connections/providers/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Super-admin server actions for the MCP connector UI: disconnect a connected MCP
 * server (flag 2c), and refresh its tool catalog (2P-4b). Both are super-admin
 * gated and org-scoped, mirroring clearBYOModelKey's discipline.
 *
 * The file exports only async functions (D-072). serverId is the connection's
 * provider_id (a first-party registry id or a 'self-hosted:<origin>' id).
 */

type McpConnectionResult = { ok: true } | { ok: false; error: string };

type McpRefreshResult =
  | { ok: true; tools: McpToolDescriptor[] }
  | { ok: false; error: string };

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

/**
 * Re-discover a connected MCP server's tools and update its stored catalog
 * (2P-4b). Explicit and super-admin-triggered: the connect-time discovery (the MCP
 * callback) ran before annotations were captured (2P-4), so already-connected
 * servers carry annotation-less catalogs; this lets a super admin backfill the
 * read-only/destructive hints so the future agent loop can tell reads from writes.
 * It is also the seam the later discovery automation (flag 4) reuses.
 *
 * BEST-EFFORT and NON-DESTRUCTIVE: re-discovery reuses the existing MCP client and
 * token path (custody ours). If it fails (token unavailable, unreachable, timeout,
 * malformed), the EXISTING catalog is left untouched and a friendly, token/PII-safe
 * error is returned — a failed refresh never wipes a good catalog. On success the
 * connections.discovered_tools jsonb is replaced with the fresh descriptors (now
 * carrying annotations); no migration (the column already holds McpToolDescriptor[]).
 */
export async function refreshMcpServerTools(
  serverId: string,
): Promise<McpRefreshResult> {
  if (!(await isCurrentUserSuperAdmin())) {
    return { ok: false, error: "You don't have permission to do that." };
  }

  // Resolve the connection (org-scoped, super-admin via RLS).
  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("connections")
    .select("id, token_ref, base_url")
    .eq("scope", "org")
    .is("owner_user_id", null)
    .eq("provider_id", serverId)
    .eq("capability_category", "mcp")
    .eq("status", "active")
    .maybeSingle();

  if (!existing) {
    return { ok: false, error: "That server isn't connected." };
  }
  const row = existing as {
    id: string;
    token_ref: string | null;
    base_url: string | null;
  };
  if (!row.token_ref || !row.base_url) {
    // No credential handle or server URL to re-discover against; leave the catalog.
    return {
      ok: false,
      error: "This connection can't be refreshed. Reconnect the server.",
    };
  }

  // Re-discover BEST-EFFORT. A fresh token (MCP refresh handled transparently,
  // custody ours), then list the tools. Any failure leaves discovered_tools intact.
  let tools: McpToolDescriptor[];
  try {
    const accessToken = await getUsableAccessToken(row.id, row.token_ref);
    tools = await listMcpServerTools({
      serverUrl: row.base_url,
      accessToken,
    });
  } catch (err) {
    // Token/PII-safe: log only the server id and the typed reason, never the token.
    const reason =
      err && typeof err === "object" && "reason" in err
        ? (err as { reason?: string }).reason
        : undefined;
    console.error("mcp tool refresh failed; catalog left intact", {
      server: serverId,
      reason,
    });
    return {
      ok: false,
      error: "Could not reach the server to refresh its tools. Try again.",
    };
  }

  // Persist the fresh catalog (service-role, mirroring the connect-time store).
  const admin = createSupabaseAdminClient();
  const { error: updateError } = await admin
    .from("connections")
    .update({ discovered_tools: tools })
    .eq("id", row.id);
  if (updateError) {
    console.error("mcp tool catalog update failed", { code: updateError.code });
    return { ok: false, error: "Could not save the refreshed tools. Try again." };
  }

  revalidatePath("/workspace/admin/policy");
  return { ok: true, tools };
}
