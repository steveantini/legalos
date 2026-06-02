import "server-only";

import { decryptApiKey } from "@/lib/connections/crypto";
import { getModelAdapter } from "@/lib/connections/providers/model-registry";
import type { ModelCredential } from "@/lib/connections/providers/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * The chat-route credential resolver (flag 1b, D-086).
 *
 * The single seam through which a model-provider credential is resolved for an
 * inference call. The chat route calls this with the org/user/vendor context
 * already in scope at the call site and passes the returned credential down to
 * the inference client, so the streaming layer stays credential-source-agnostic.
 *
 * This is the ONLY place the platform model key is read (it moved here from
 * createAnthropicClient), so there remains exactly one platform-key read site.
 *
 * Resolution order (1b implements only the managed branch):
 *   1. The vendor must be a registered model provider — an unknown vendor is
 *      rejected here, so it can never silently inherit another provider's key.
 *   2. (1c) If the org has a bring-your-own model connection for this vendor,
 *      decrypt and return that key (+ optional baseURL) from connection_secrets.
 *   3. Managed mode: return the platform key for the vendor. Today only Anthropic
 *      has a managed platform key; other registered providers without one are
 *      BYO-only and resolve nothing until 1c.
 *
 * `organizationId` and `userId` are accepted now (the call site has them) so the
 * 1c BYO branch needs no signature change; 1b does not read them.
 */
export async function resolveModelCredential(params: {
  organizationId: string;
  userId: string;
  vendor: string;
}): Promise<ModelCredential> {
  const { vendor } = params;

  // 1. The vendor must be a known model provider. Rejecting here (rather than
  //    falling through to a default key) is the no-foot-gun guarantee: an
  //    unknown or future non-Anthropic vendor never resolves to Anthropic's key.
  const adapter = getModelAdapter(vendor);
  if (!adapter) {
    throw new Error(`No model provider registered for vendor "${vendor}"`);
  }

  // 2. Bring-your-own-key branch (1c, D-087). If the org has an active BYO model
  //    connection for this vendor, use its stored key (+ optional base URL)
  //    instead of the platform key. The read is service-role: a grant-less org
  //    connection is super-admin-read-only under RLS, and the secret lives in the
  //    service-role-only connection_secrets table. The lookup is tolerant of the
  //    feature being absent (pre-migration columns, a query error, or no row) and
  //    falls through to managed, so chat is never interrupted.
  const byo = await resolveByoCredential(vendor);
  if (byo) return byo;

  // 3. Managed mode: the platform key for the vendor.
  switch (vendor) {
    case "anthropic": {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          "ANTHROPIC_API_KEY is not set. Configure it in .env.local for local " +
            "dev and in Vercel Production/Preview env vars for deploys. See " +
            "SETUP.md and DECISION_LOG.md D-008.",
        );
      }
      return { apiKey };
    }
    default:
      // A registered provider with no managed platform key is BYO-only. The BYO
      // branch above already ran and found nothing, so there is no credential to
      // resolve for this vendor.
      throw new Error(`No managed credential available for vendor "${vendor}"`);
  }
}

/**
 * Resolve a bring-your-own model credential for a vendor, or null if the org has
 * no active BYO model connection for it (or the feature is not yet available).
 *
 * Service-role throughout: the org model connection is grant-less and thus
 * super-admin-read-only under RLS, and connection_secrets is service-role-only.
 * Fully tolerant — any failure (pre-migration columns, a query error, a missing
 * secret, a decrypt failure) returns null so the caller falls back to the managed
 * platform key and chat is never interrupted. The key is never logged or
 * returned anywhere but in the ModelCredential handed to the client factory.
 */
async function resolveByoCredential(
  vendor: string,
): Promise<ModelCredential | null> {
  try {
    const admin = createSupabaseAdminClient();

    // The active org BYO model connection for this vendor. The unique partial
    // index (migration 0051) guarantees at most one active org model connection
    // per vendor, so this is deterministic.
    const { data: connection, error: connectionError } = await admin
      .from("connections")
      .select("token_ref, base_url")
      .eq("scope", "org")
      .is("owner_user_id", null)
      .eq("provider_id", vendor)
      .eq("capability_category", "models")
      .eq("status", "active")
      .eq("credential_source", "byo")
      .limit(1)
      .maybeSingle();
    if (connectionError || !connection) return null;

    const row = connection as { token_ref: string | null; base_url: string | null };
    if (!row.token_ref) return null;

    const { data: secret, error: secretError } = await admin
      .from("connection_secrets")
      .select("ciphertext")
      .eq("id", row.token_ref)
      .maybeSingle();
    if (secretError || !secret) return null;

    const apiKey = decryptApiKey((secret as { ciphertext: string }).ciphertext);
    return { apiKey, ...(row.base_url ? { baseURL: row.base_url } : {}) };
  } catch (err) {
    // Pre-migration (unknown column) or any transient failure: fall back to
    // managed. Log only an error code, never the key or the row.
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as { code?: string }).code
        : undefined;
    console.error(
      "byo model credential resolution failed; falling back to managed",
      { vendor, code },
    );
    return null;
  }
}
