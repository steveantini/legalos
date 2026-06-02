import "server-only";

import type { ModelProviderAdapter } from "@/lib/connections/providers/types";

/**
 * Anthropic model-provider adapter (the first model kind, flag 1b).
 *
 * `providerId` is the vendor segment of an Anthropic model id (parseModelId,
 * e.g. 'anthropic/claude-opus-4-8' → 'anthropic'); the chat-route dispatcher and
 * the credential resolver key on it. `capabilityCategory` is descriptive only —
 * model providers are not yet a governed connection-policy category (that, with
 * stored connection rows and bring-your-own keys, lands in 1c).
 *
 * The adapter is deliberately minimal in 1b: it identifies Anthropic as a model
 * provider so the model kind is real in the registry. `listModels` is not
 * implemented — the available-models list still comes from the canonical
 * models.ts array. Inference-client construction lives in lib/llm/anthropic,
 * driven by the resolved ModelCredential.
 */
export const anthropicModelAdapter: ModelProviderAdapter = {
  kind: "model",
  providerId: "anthropic",
  capabilityCategory: "models",
};
