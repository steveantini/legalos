import "server-only";

import { anthropicModelAdapter } from "@/lib/connections/providers/anthropic";
import type { ModelProviderAdapter } from "@/lib/connections/providers/types";

/**
 * The model-provider registry: maps a vendor (the parseModelId vendor segment)
 * to its model adapter. Distinct from the OAuth ADAPTERS registry (registry.ts)
 * because model providers are looked up by vendor and authenticated by a
 * per-org API key, never "connected" through the OAuth connect/callback flow.
 *
 * Anthropic is the only model provider in 1b. Google, OpenAI, and self-hosted
 * join later as one entry each. The credential resolver consults this registry
 * so an unknown vendor is rejected here rather than silently resolving to
 * another provider's key (D-086).
 */

const MODEL_ADAPTERS: Record<string, ModelProviderAdapter> = {
  [anthropicModelAdapter.providerId]: anthropicModelAdapter,
};

/** The model adapter for a vendor, or null if no model provider is registered for it. */
export function getModelAdapter(vendor: string): ModelProviderAdapter | null {
  return MODEL_ADAPTERS[vendor] ?? null;
}

/** Vendors that currently have a registered model provider. */
export const MODEL_PROVIDER_VENDORS = Object.keys(MODEL_ADAPTERS);
