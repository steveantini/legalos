import "server-only";

import {
  decryptTokenBundle,
  encryptTokenBundle,
} from "@/lib/connections/crypto";
import { getAdapter } from "@/lib/connections/providers/registry";
import type { TokenBundle } from "@/lib/connections/providers/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * The token-exercise layer (M6a, D-067): turns a stored connection secret into a
 * usable, fresh access token for a live provider call.
 *
 * Called only AFTER the M5 capability gate (canExerciseCapability) authorizes,
 * with the connectionId + tokenRef it returns. The encrypted token lives in
 * connection_secrets, an RLS-forced table with no policies — so this layer is
 * the service-role admin client's job (the only client that can reach it). The
 * raw token, refresh token, and decrypted bundle are NEVER logged.
 *
 * Refresh-on-expiry: if the access token is at/near expiry it is refreshed via
 * the provider adapter and the re-encrypted bundle is persisted, so the next
 * call reuses it. A refresh failure (revoked/expired refresh token) is a clean
 * typed error so callers degrade gracefully rather than crashing the chat turn,
 * and the connection is best-effort marked `error` for the UI to surface later.
 */

/** Treat a token as expired if it dies within this window, to avoid mid-request expiry. */
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

/** Why a usable access token could not be produced. Carries no token material. */
export type TokenUnavailableReason =
  | "secret_missing"
  | "decrypt_failed"
  | "no_refresh_token"
  | "refresh_failed";

/** Typed failure so the resolver can surface an attachment as unavailable. */
export class TokenUnavailableError extends Error {
  constructor(
    readonly connectionId: string,
    readonly reason: TokenUnavailableReason,
  ) {
    super(reason);
    this.name = "TokenUnavailableError";
  }
}

/**
 * Read + decrypt the stored token for a connection and return a non-expired
 * access token, refreshing and persisting if needed. Throws
 * {@link TokenUnavailableError} on any failure.
 */
export async function getUsableAccessToken(
  connectionId: string,
  tokenRef: string,
): Promise<string> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("connection_secrets")
    .select("ciphertext")
    .eq("id", tokenRef)
    .maybeSingle();
  if (error || !data) {
    throw new TokenUnavailableError(connectionId, "secret_missing");
  }

  let bundle: TokenBundle;
  try {
    bundle = decryptTokenBundle((data as { ciphertext: string }).ciphertext);
  } catch {
    throw new TokenUnavailableError(connectionId, "decrypt_failed");
  }

  const expired =
    bundle.expiresAt !== null &&
    bundle.expiresAt <= Date.now() + EXPIRY_SAFETY_MARGIN_MS;
  if (!expired) {
    return bundle.accessToken;
  }

  // Expired/near-expiry: a refresh token is required to mint a new one.
  if (!bundle.refreshToken) {
    await markConnectionError(admin, connectionId);
    throw new TokenUnavailableError(connectionId, "no_refresh_token");
  }

  // Resolve the refresh STRATEGY from this connection's kind (2b-ii-1). The
  // connection row carries the provider id and capability category; the OAuth
  // registry resolves an oauth-kind connection's adapter. This read runs only on
  // the expired-token path, so the valid-token fast path above is untouched.
  const { data: connRow } = await admin
    .from("connections")
    .select("provider_id, capability_category")
    .eq("id", connectionId)
    .maybeSingle();
  const providerId = (connRow as { provider_id?: string } | null)?.provider_id;
  const category = (connRow as { capability_category?: string } | null)
    ?.capability_category;
  const adapter = providerId ? getAdapter(providerId) : null;

  let refreshed: TokenBundle;
  if (adapter && adapter.kind === "oauth") {
    // OAuth-kind refresh (Google Drive today, and any future OAuth provider):
    // resolve the adapter via the registry and refresh exactly as before. For
    // Drive this is byte-for-byte equivalent to the previous hardcoded call —
    // the registry returns the same googleDriveAdapter for 'google-drive'. The
    // adapter preserves the existing refresh token if the provider omits one.
    try {
      refreshed = await adapter.refreshAccessToken(bundle.refreshToken);
    } catch {
      await markConnectionError(admin, connectionId);
      throw new TokenUnavailableError(connectionId, "refresh_failed");
    }
  } else if (category === "mcp") {
    // MCP-kind refresh lands here in 2b-ii-2: the SDK's refreshAuthorization
    // against the discovered authorization server, using our stored client info,
    // re-encrypted into our own connection_secrets (the control-plane principle —
    // the SDK is the protocol mechanism, custody stays ours). Unreachable today:
    // no MCP connection can exist before the MCP connect flow is built. The clear
    // throw guards against a future ordering mistake.
    throw new Error(
      "MCP token refresh is not yet implemented (flag 2b-ii-2). " +
        "No MCP connection should exist before the MCP connect flow ships.",
    );
  } else {
    // No known refresh strategy for this connection's provider. Today this is
    // unreachable (the only OAuth connection is Drive, which resolves above);
    // fail closed rather than silently returning a stale token.
    await markConnectionError(admin, connectionId);
    throw new TokenUnavailableError(connectionId, "refresh_failed");
  }

  // Persist the refreshed bundle so the next call reuses it. A persist failure
  // does not fail THIS turn (we already hold a fresh access token); log only the
  // connectionId, never token material.
  const { error: updateError } = await admin
    .from("connection_secrets")
    .update({ ciphertext: encryptTokenBundle(refreshed) })
    .eq("id", tokenRef);
  if (updateError) {
    console.error("connection token persist failed", { connectionId });
  }

  return refreshed.accessToken;
}

// Best-effort: mark a connection as needing reconnection so the Connections UI
// can later reflect it. Never throws — a failure here must not mask the typed
// TokenUnavailableError the caller is about to receive.
async function markConnectionError(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  connectionId: string,
): Promise<void> {
  try {
    await admin
      .from("connections")
      .update({ status: "error" })
      .eq("id", connectionId);
  } catch {
    // swallow — best-effort status update
  }
}
