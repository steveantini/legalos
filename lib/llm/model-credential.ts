import "server-only";

import { getModelAdapter } from "@/lib/connections/providers/model-registry";
import type { ModelCredential } from "@/lib/connections/providers/types";

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

  // 2. (1c) BYO branch slots in here: look up the org's model connection for
  //    this vendor and, if present, decrypt its stored key from connection_
  //    secrets and return it (+ baseURL). organizationId/userId feed that lookup.

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
      // A registered provider with no managed platform key is BYO-only; until
      // the 1c BYO branch exists there is nothing to resolve.
      throw new Error(`No managed credential available for vendor "${vendor}"`);
  }
}
