import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  CONNECTIONS_PATH_PREFIX,
  connectionsPageUrl,
  mcpConnectionsCallbackUrl,
  resolveAppBaseUrl,
} from "@/lib/connections/base-url";
import {
  constantTimeEqual,
  encryptTokenBundle,
  OAUTH_STATE_COOKIE_MCP,
  openSecretJson,
  verifyState,
} from "@/lib/connections/crypto";
import {
  completeMcpAuthorization,
  type McpCookiePayload,
  type McpStoredSecret,
} from "@/lib/connections/mcp/auth";
import {
  deriveMcpTrustTier,
  getTrustedMcpServer,
} from "@/lib/connections/providers/mcp-registry";
import { isCurrentUserSuperAdmin } from "@/lib/auth/access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Complete the OAuth 2.1 flow for a trusted first-party MCP server (flag 2b-ii-2).
 *
 * GET /api/connections/mcp/callback?code=...&state=...   (or ?error=... on denial)
 *
 * TRUST GATE point 2 (D-089): trust is RE-DERIVED from the verified state's
 * server id (`deriveMcpTrustTier(serverId, isSelfHostedPath=false)` must be
 * `first_party`) before any token is created, so a forged or replayed callback
 * for an untrusted server creates nothing. Custody stays ours: the exchanged
 * tokens AND the registered-client info are encrypted into our connection_secrets
 * (one row, the client_secret never plaintext, service-role only). The connection
 * is org-scoped (super-admin-gated by RLS), grant-less (org-wide, like models),
 * and all-or-nothing (the secret is rolled back if the connection insert fails).
 */

export const runtime = "nodejs";

const STATE_COOKIE_CLEAR = { path: CONNECTIONS_PATH_PREFIX, maxAge: 0 };

function finish(query: { error?: string; connected?: string }) {
  const response = NextResponse.redirect(connectionsPageUrl(query));
  response.cookies.set(OAUTH_STATE_COOKIE_MCP, "", STATE_COOKIE_CLEAR);
  return response;
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${resolveAppBaseUrl()}/login`);
  }
  // Re-assert super-admin (the initiate gate plus this is defense in depth; RLS
  // also enforces it on the org connection write below).
  if (!(await isCurrentUserSuperAdmin())) {
    return finish({ error: "not_allowed" });
  }

  const params = new URL(request.url).searchParams;
  const providerError = params.get("error");
  const code = params.get("code");
  const stateParam = params.get("state");

  const cookieStore = await cookies();
  const sealed = cookieStore.get(OAUTH_STATE_COOKIE_MCP)?.value;

  if (providerError) {
    return finish({ error: "denied" });
  }
  if (!code || !stateParam || !sealed) {
    return finish({ error: "state" });
  }

  // ---- CSRF validation: signed state verifies, its nonce matches the sealed
  //      cookie, and its user id is the session user.
  const state = verifyState(stateParam);
  const cookie = openSecretJson<McpCookiePayload>(sealed);
  if (!state || !cookie) return finish({ error: "state" });
  if (!constantTimeEqual(state.n, cookie.nonce)) return finish({ error: "state" });
  if (state.u !== user.id) return finish({ error: "state" });

  const serverId = state.p;

  // ---- TRUST GATE (point 2): re-derive trust from the server id. First-party
  //      only here (self-hosted is 2b-ii-3); anything else creates nothing.
  if (deriveMcpTrustTier(serverId, false) !== "first_party") {
    return finish({ error: "unsupported_server" });
  }
  const entry = getTrustedMcpServer(serverId);
  if (!entry) {
    return finish({ error: "unsupported_server" });
  }

  // ---- Exchange the authorization code for tokens (our orchestration; the SDK
  //      performs the protocol and hands the tokens back to us).
  let bundle;
  try {
    bundle = await completeMcpAuthorization({
      serverUrl: entry.discoveryBaseUrl,
      clientInformation: cookie.clientInformation,
      authorizationCode: code,
      codeVerifier: cookie.verifier,
      redirectUri: mcpConnectionsCallbackUrl(),
    });
  } catch {
    console.error("mcp token exchange failed", { server: serverId });
    return finish({ error: "exchange" });
  }

  // ---- Store the token bundle AND the registered-client info in ONE encrypted
  //      connection_secrets row (custody ours; client_secret never plaintext).
  const storedSecret: McpStoredSecret = {
    ...bundle,
    mcpClientInformation: cookie.clientInformation,
    mcpServerUrl: entry.discoveryBaseUrl,
  };
  const admin = createSupabaseAdminClient();
  let secretId: string;
  try {
    const { data, error } = await admin
      .from("connection_secrets")
      .insert({ ciphertext: encryptTokenBundle(storedSecret) })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("no secret id returned");
    secretId = data.id as string;
  } catch {
    console.error("mcp secret store failed", { server: serverId });
    return finish({ error: "store" });
  }

  // ---- Create the org-scoped MCP connection row (super-admin via RLS). MCP
  //      connections are grant-less (org-wide, like model connections), so no
  //      connection_grants row is written. base_url is the server URL
  //      (informational; trust is the registry, not the URL).
  const { data: connection, error: connectionError } = await supabase
    .from("connections")
    .insert({
      provider_id: serverId,
      capability_category: "mcp",
      scope: "org",
      owner_user_id: null,
      created_by_user_id: user.id,
      token_ref: secretId,
      status: "active",
      base_url: entry.discoveryBaseUrl,
      provider_account_label: entry.displayName,
    })
    .select("id")
    .single();

  if (connectionError || !connection) {
    // Roll back the orphaned secret.
    await admin.from("connection_secrets").delete().eq("id", secretId);
    console.error("mcp connection insert failed", { server: serverId });
    return finish({ error: "store" });
  }

  return finish({ connected: serverId });
}
