import "server-only";

import { NextResponse } from "next/server";

import {
  CONNECTIONS_PATH_PREFIX,
  connectionsCallbackUrl,
  connectionsPageUrl,
  resolveAppBaseUrl,
} from "@/lib/connections/base-url";
import {
  OAUTH_STATE_COOKIE,
  pkceChallenge,
  randomToken,
  sealOAuthCookie,
  signState,
} from "@/lib/connections/crypto";
import { getAdapter } from "@/lib/connections/providers/registry";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Initiate a connection OAuth flow.
 *
 * GET /api/connections/connect?provider=<providerId>
 *
 * The Connect affordance on the Connections page links here. The route:
 *   1. Requires an authenticated session (the proxy already gates this; the
 *      explicit check is defense in depth and avoids a confusing bounce).
 *   2. Resolves the provider adapter from the registry; unknown provider →
 *      back to Connections with a calm error.
 *   3. Checks the org connection policy (allowed categories + providers); a
 *      disallowed provider is rejected cleanly without starting the flow.
 *   4. Generates a CSRF state (signed: provider + nonce + user id) and a PKCE
 *      verifier, seals the nonce + verifier into a short-lived httpOnly cookie,
 *      and redirects to the provider's consent screen with offline access.
 *
 * The cookie is path-scoped to /api/connections so it travels to the callback
 * but nowhere else, and is sameSite=lax so it survives the top-level GET
 * redirect back from the provider.
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

  const providerId =
    new URL(request.url).searchParams.get("provider")?.trim() ?? "";
  const adapter = getAdapter(providerId);
  if (!adapter) {
    return backToConnections("unsupported_provider");
  }

  // ---- Policy gate. Any authenticated user may read the singleton policy
  //      (RLS connection_policy_read_authenticated). A provider or category the
  //      org has not allowed is rejected before the flow starts.
  const { data: policy } = await supabase
    .from("connection_policy")
    .select("allowed_categories, allowed_providers")
    .eq("id", 1)
    .maybeSingle();
  const allowedCategories = (policy?.allowed_categories ?? []) as string[];
  const allowedProviders = (policy?.allowed_providers ?? []) as string[];
  if (
    !allowedCategories.includes(adapter.capabilityCategory) ||
    !allowedProviders.includes(adapter.providerId)
  ) {
    return backToConnections("not_allowed");
  }

  // ---- CSRF state + PKCE. The nonce links the signed state to the sealed
  //      cookie; the verifier is replayed at the token exchange.
  const nonce = randomToken();
  const verifier = randomToken();
  const state = signState({ p: adapter.providerId, n: nonce, u: user.id });

  const authUrl = adapter.buildAuthorizationUrl({
    redirectUri: connectionsCallbackUrl(),
    state,
    codeChallenge: pkceChallenge(verifier),
  });

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(OAUTH_STATE_COOKIE, sealOAuthCookie({ nonce, verifier }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: CONNECTIONS_PATH_PREFIX,
    maxAge: 600, // 10 minutes — ample for a consent round-trip.
  });
  return response;
}
