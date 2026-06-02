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
  isTrustedFirstPartyServer,
  selfHostedServerId,
} from "@/lib/connections/providers/mcp-registry";
import { isCurrentUserSuperAdmin } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Initiate the OAuth 2.1 flow to connect a customer's own SELF-HOSTED MCP server
 * (flag 2b-ii-3) — the second trusted tier, partitioned from the first-party flow.
 *
 * GET /api/connections/mcp/self-hosted?url=<customerServerUrl>
 *
 * Trusted because the customer OWNS the infrastructure, not because of any
 * allowlist. This route is its own sibling so the first-party connect route is
 * untouched. The two paths cannot cross:
 *   - This route only ever derives a `self-hosted:<origin>` server id (a reserved
 *     namespace disjoint from every first-party registry id), so it can never
 *     produce a first-party connection.
 *   - The first-party route only accepts registry ids, so it can never produce a
 *     self-hosted connection.
 *   - The server id (carrying the self-hosted marker) rides inside the SIGNED
 *     state; the customer URL rides inside the sealed (encrypted) cookie; the
 *     shared callback re-derives the tier from the signed id. A tamperer can flip
 *     neither.
 *
 * Org MCP connections are super-admin governance (RLS enforces the same). The
 * customer URL must be a well-formed https URL. The flow then reuses the same
 * discovery-backed OAuth machinery as the first-party path against the customer's
 * server; every secret is stored in OUR encrypted substrate, never by the SDK.
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

  // Org MCP connections are a super-admin governance action.
  if (!(await isCurrentUserSuperAdmin())) {
    return backToConnections("not_allowed");
  }

  // ---- Validate the customer-supplied server URL: well-formed and https only.
  const rawUrl = new URL(request.url).searchParams.get("url")?.trim() ?? "";
  let serverUrl: URL;
  try {
    serverUrl = new URL(rawUrl);
  } catch {
    return backToConnections("invalid_server_url");
  }
  if (serverUrl.protocol !== "https:") {
    return backToConnections("invalid_server_url");
  }

  // ---- Derive the self-hosted server id from the origin. It is ALWAYS in the
  //      reserved self-hosted namespace, so this path can never emit a first-party
  //      id. The defensive assertion makes the partition explicit (and can never
  //      fail: registry ids never carry the self-hosted prefix).
  const serverId = selfHostedServerId(serverUrl.origin);
  if (isTrustedFirstPartyServer(serverId)) {
    return backToConnections("unsupported_server");
  }

  // ---- CSRF state (signed: self-hosted serverId + nonce + user id).
  const nonce = randomToken();
  const state = signState({ p: serverId, n: nonce, u: user.id });
  const redirectUri = mcpConnectionsCallbackUrl();

  // ---- Same discovery-backed auth as the first-party path, against the customer
  //      server. A server that does not speak OAuth 2.1 / MCP fails cleanly.
  let begun;
  try {
    begun = await beginMcpAuthorization({
      serverUrl: serverUrl.toString(),
      redirectUri,
      state,
    });
  } catch {
    // Never logs token/secret material; only the server origin.
    console.error("self-hosted mcp authorization initiate failed", {
      origin: serverUrl.origin,
    });
    return backToConnections("mcp_connect_failed");
  }

  const response = NextResponse.redirect(begun.authorizationUrl);
  response.cookies.set(
    OAUTH_STATE_COOKIE_MCP,
    sealSecretJson({
      nonce,
      verifier: begun.codeVerifier,
      clientInformation: begun.clientInformation,
      // The customer URL the callback discovers/exchanges against and stores as
      // base_url. Sealed (encrypted, tamper-proof) and bound to the flow by nonce.
      serverUrl: serverUrl.toString(),
    }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: CONNECTIONS_PATH_PREFIX,
      maxAge: 600,
    },
  );
  return response;
}
