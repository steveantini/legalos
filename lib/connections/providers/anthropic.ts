import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import type {
  CredentialValidationResult,
  ModelCredential,
  ModelProviderAdapter,
} from "@/lib/connections/providers/types";

/**
 * Anthropic model-provider adapter (the first model kind, flag 1b; key
 * validation in 1c).
 *
 * `providerId` is the vendor segment of an Anthropic model id (parseModelId,
 * e.g. 'anthropic/claude-opus-4-8' → 'anthropic'); the chat-route dispatcher and
 * the credential resolver key on it. `capabilityCategory` is descriptive only —
 * model connections are governed as their own Policy & access control, not the
 * data-source connection_policy gate (D-087).
 *
 * `listModels` is not implemented — the available-models list still comes from
 * the canonical models.ts array. Inference-client construction lives in
 * lib/llm/anthropic, driven by the resolved ModelCredential.
 */
export const anthropicModelAdapter: ModelProviderAdapter = {
  kind: "model",
  providerId: "anthropic",
  capabilityCategory: "models",

  async validateCredential(
    credential: ModelCredential,
  ): Promise<CredentialValidationResult> {
    // The cheapest reliable auth check: GET /v1/models. It exercises the key's
    // authentication with no token cost and no message charge; a 401/403 means a
    // bad key, anything else network/transient. We never surface the raw provider
    // error or the key — only a friendly, safe message.
    try {
      const client = new Anthropic({
        apiKey: credential.apiKey,
        ...(credential.baseURL ? { baseURL: credential.baseURL } : {}),
      });
      await client.models.list({ limit: 1 });
      return { ok: true };
    } catch (err) {
      const status =
        err instanceof Anthropic.APIError ? err.status : undefined;
      if (status === 401 || status === 403) {
        return {
          ok: false,
          error: "That key was rejected by Anthropic. Check it and try again.",
        };
      }
      // Network error, unexpected endpoint (a wrong base URL), or a transient
      // provider issue. Log only the status code, never the key or raw body.
      console.error("anthropic credential validation failed", { status });
      return {
        ok: false,
        error:
          "Could not reach Anthropic to verify that key. Check the key (and base URL, if set) and try again.",
      };
    }
  },
};
