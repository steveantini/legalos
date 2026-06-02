import "server-only";

import { NextResponse } from "next/server";

import {
  CONNECTIONS_PATH_PREFIX,
  connectionsPageUrl,
  mcpConnectionsCallbackUrl,
  resolveAppBaseUrl,
} from "@/lib/connections/base-url";
import {
  OAUTH_STATE_COOKIE_MCP,
  randomToken,
  sealSecretJson,
  signState,
} from "@/lib/connections/crypto";
import { beginMcpAuthorization } from "@/lib/connections/mcp/auth";
import {
  getTrustedMcpServer,
  isTrustedFirstPartyServer,
} from "@/lib/connections/providers/mcp-registry";
import { isCurrentUserSuperAdmin } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Initiate the OAuth 2.1 flow to connect a TRUSTED FIRST-PARTY MCP server
 * (flag 2b-ii-2).
 *
 * GET /api/connections/mcp/connect?server=<serverId>
 *
 * Trusted-only and un-bypassable (D-089): TRUST GATE point 1 here rejects any
 * server that is not a first-party allowlist entry BEFORE any network/auth step;
 * the self-hosted path is a separate flow (2b-ii-3). Org MCP connections are
 * super-admin governance, so the route is super-admin gated (mirroring the org
 * connection write RLS). The flow then discovers the server's authorization
 * server, registers our client, and redirects to consent — every secret it
 * produces is stored in OUR encrypted substrate, never by the SDK.
 *
 * The sealed cookie (encrypted, httpOnly, path-scoped to /api/connections,
 * short-lived) carries the nonce, PKCE verifier, and the registered-client info
 * the callback needs. The signed state carries the serverId so the callback
 * re-resolves and re-checks trust.
 */

export const runtime = "nodejs";

function backToConnections(error: string) {
  return NextResponse.redirect(connectionsPageUrl({ error }));
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${resolveAppBaseUrl()}/login`);
  }

  // Org MCP connections are a super-admin governance action (RLS enforces the
  // same at the DB; this is the route-level gate).
  if (!(await isCurrentUserSuperAdmin())) {
    return backToConnections("not_allowed");
  }

  const serverId =
    new URL(request.url).searchParams.get("server")?.trim() ?? "";

  // ---- TRUST GATE (point 1): only a first-party allowlist server is connectable
  //      through this flow. Not a registry entry → unsupported, before any auth
  //      step. (The self-hosted path is 2b-ii-3; an arbitrary server has no entry
  //      here, so it is unrepresentable as connectable.)
  if (!isTrustedFirstPartyServer(serverId)) {
    return backToConnections("unsupported_server");
  }
  const entry = getTrustedMcpServer(serverId);
  if (!entry) {
    return backToConnections("unsupported_server");
  }

  // ---- CSRF state (signed: serverId + nonce + user id) carried through consent.
  const nonce = randomToken();
  const state = signState({ p: serverId, n: nonce, u: user.id });
  const redirectUri = mcpConnectionsCallbackUrl();

  // ---- Discover, register our client, and build the authorization URL.
  let begun;
  try {
    begun = await beginMcpAuthorization({
      serverUrl: entry.discoveryBaseUrl,
      redirectUri,
      state,
    });
  } catch {
    // Never logs token/secret material; only the server id.
    console.error("mcp authorization initiate failed", { server: serverId });
    return backToConnections("mcp_connect_failed");
  }

  const response = NextResponse.redirect(begun.authorizationUrl);
  response.cookies.set(
    OAUTH_STATE_COOKIE_MCP,
    sealSecretJson({
      nonce,
      verifier: begun.codeVerifier,
      clientInformation: begun.clientInformation,
    }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: CONNECTIONS_PATH_PREFIX,
      maxAge: 600, // 10 minutes — ample for a consent round-trip.
    },
  );
  return response;
}
