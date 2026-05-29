import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  CONNECTIONS_PATH_PREFIX,
  connectionsCallbackUrl,
  connectionsPageUrl,
  resolveAppBaseUrl,
} from "@/lib/connections/base-url";
import {
  constantTimeEqual,
  encryptTokenBundle,
  OAUTH_STATE_COOKIE,
  openOAuthCookie,
  verifyState,
} from "@/lib/connections/crypto";
import {
  constrainCapabilitiesToCeiling,
  isConnectionAllowed,
} from "@/lib/connections/policy";
import { getAdapter } from "@/lib/connections/providers/registry";
import type { TokenBundle } from "@/lib/connections/providers/types";
import type { Capability } from "@/lib/settings/connections";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The single, provider-agnostic OAuth callback. Every provider redirects here;
 * the provider is identified by the verified OAuth state, not the path. This
 * exact path (/api/connections/callback) is the registered redirect URI — it
 * must not move, or the provider returns redirect_uri_mismatch.
 *
 * GET /api/connections/callback?code=...&state=...   (or ?error=... on denial)
 *
 * The flow is resilient and all-or-nothing: a connection row is never created
 * without its encrypted tokens stored first, and any failure after the secret
 * is written rolls the partial state back, so no orphaned secret or
 * tokenless connection is ever left behind.
 *
 *   1. Require a session; handle a provider error (e.g. denied consent) calmly.
 *   2. Validate the signed state against the sealed cookie nonce (CSRF) and
 *      confirm the state's user id matches the session.
 *   3. Exchange the code for tokens (PKCE verifier from the cookie).
 *   4. Fetch the connected account label (best effort).
 *   5. Encrypt tokens → connection_secrets (service role). Then create the
 *      connection row (token_ref → secret) and a read-capability grant via the
 *      user's RLS-scoped client. Roll back on any failure.
 *   6. Redirect to the Connections page, now reflecting the connected state.
 */

export const runtime = "nodejs";

const STATE_COOKIE_CLEAR = {
  path: CONNECTIONS_PATH_PREFIX,
  maxAge: 0,
};

function finish(query: { error?: string; connected?: string }) {
  const response = NextResponse.redirect(connectionsPageUrl(query));
  // Always clear the one-shot state cookie on the way out.
  response.cookies.set(OAUTH_STATE_COOKIE, "", STATE_COOKIE_CLEAR);
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

  const params = new URL(request.url).searchParams;
  const providerError = params.get("error");
  const code = params.get("code");
  const stateParam = params.get("state");

  const cookieStore = await cookies();
  const sealed = cookieStore.get(OAUTH_STATE_COOKIE)?.value;

  // ---- Provider-side error (most commonly the user declining consent). No
  //      rows are created; the page shows a calm, non-blaming message.
  if (providerError) {
    return finish({ error: "denied" });
  }

  if (!code || !stateParam || !sealed) {
    return finish({ error: "state" });
  }

  // ---- CSRF validation: signed state must verify, its nonce must match the
  //      sealed cookie nonce, and its user id must be the session user.
  const state = verifyState(stateParam);
  const cookie = openOAuthCookie(sealed);
  if (!state || !cookie) return finish({ error: "state" });
  if (!constantTimeEqual(state.n, cookie.nonce)) return finish({ error: "state" });
  if (state.u !== user.id) return finish({ error: "state" });

  const adapter = getAdapter(state.p);
  if (!adapter) return finish({ error: "unsupported_provider" });

  // ---- Policy re-check (defense in depth). The initiate route already gated
  //      this, but re-verifying here means a stale or replayed callback can
  //      never create a connection the policy forbids — both ends enforce the
  //      same shared rule.
  if (!(await isConnectionAllowed(adapter.providerId, adapter.capabilityCategory))) {
    return finish({ error: "not_allowed" });
  }

  // ---- Capabilities to grant, DERIVED from policy rather than hardcoded. This
  //      read connection requests ['read'] (write is deferred to the
  //      write-capability-grant feature); constraining to the ceiling means the
  //      grant can never exceed policy, and a future ceiling change is respected
  //      without touching this code. If the ceiling grants nothing, the
  //      connection would be useless and is effectively forbidden — reject
  //      before exchanging the code, so no rows or tokens are created.
  const requestedCapabilities: Capability[] = ["read"];
  const grantCapabilities = await constrainCapabilitiesToCeiling(
    requestedCapabilities,
  );
  if (grantCapabilities.length === 0) {
    return finish({ error: "not_allowed" });
  }

  // ---- Exchange the authorization code for tokens.
  let bundle: TokenBundle;
  try {
    bundle = await adapter.exchangeCode({
      code,
      redirectUri: connectionsCallbackUrl(),
      codeVerifier: cookie.verifier,
    });
  } catch {
    // The error may carry token material; never log it. Only the provider id.
    console.error("oauth token exchange failed", { provider: state.p });
    return finish({ error: "exchange" });
  }

  // ---- Account label (best effort; a missing label is not a failure).
  let accountLabel: string | null = null;
  try {
    accountLabel = await adapter.fetchAccountLabel(bundle.accessToken);
  } catch {
    accountLabel = null;
  }

  // ---- Store the encrypted tokens first (service role; RLS denies all other
  //      roles). token_ref will point at this row.
  const admin = createSupabaseAdminClient();
  let secretId: string;
  try {
    const { data, error } = await admin
      .from("connection_secrets")
      .insert({ ciphertext: encryptTokenBundle(bundle) })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("no secret id returned");
    secretId = data.id as string;
  } catch {
    console.error("connection secret store failed", { provider: state.p });
    return finish({ error: "store" });
  }

  // ---- Create the connection row (user's RLS-scoped client; the
  //      connections_personal_write policy authorizes owner = auth.uid()).
  const { data: connection, error: connectionError } = await supabase
    .from("connections")
    .insert({
      provider_id: adapter.providerId,
      capability_category: adapter.capabilityCategory,
      scope: "personal",
      owner_user_id: user.id,
      created_by_user_id: user.id,
      token_ref: secretId,
      status: "active",
      provider_account_label: accountLabel,
    })
    .select("id")
    .single();

  if (connectionError || !connection) {
    // Roll back the orphaned secret.
    await admin.from("connection_secrets").delete().eq("id", secretId);
    console.error("connection insert failed", { provider: state.p });
    return finish({ error: "store" });
  }

  // ---- Create the owner self-grant with the policy-derived capabilities
  //      computed above (read-only today, matching drive.readonly and the
  //      ceiling — but sourced from policy, not hardcoded).
  const { error: grantError } = await supabase.from("connection_grants").insert({
    connection_id: connection.id,
    grantee_user_id: user.id,
    capabilities: grantCapabilities,
    granted_by_user_id: user.id,
  });

  if (grantError) {
    // Roll back the connection (which leaves no grant) and the secret.
    await supabase.from("connections").delete().eq("id", connection.id);
    await admin.from("connection_secrets").delete().eq("id", secretId);
    console.error("connection grant insert failed", { provider: state.p });
    return finish({ error: "store" });
  }

  return finish({ connected: adapter.providerId });
}
