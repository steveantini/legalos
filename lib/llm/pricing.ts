/**
 * Per-model cost rates in USD per 1,000,000 tokens, keyed on the
 * vendor-prefixed model id (e.g. 'anthropic/claude-sonnet-4-6'). The rates
 * themselves live on each entry in the canonical models source
 * (lib/llm/models.ts); this map is derived from it so pricing, validation, and
 * the pickers can never carry a different model set. Updating a rate (or adding
 * a model) is a one-place edit in models.ts.
 *
 * Cache rates: Anthropic's 5-minute ephemeral prompt cache charges
 * 1.25× the base input rate on the cache-write turn and 0.1× on
 * cache-read turns. The break-even is one cache-read turn after the
 * write — any conversation longer than two turns saves money. Multi-
 * vendor caching is per-adapter (OpenAI auto-caches, Gemini differs);
 * each vendor's entry carries its own rates.
 *
 * NOTE on Opus-generation tokenization: Anthropic introduced a new tokenizer
 * with Opus 4.7 (carried forward to Opus 4.8 and Fable 5) that can produce up
 * to ~35% more tokens for the same source text vs. older models. Real cost per request can
 * vary noticeably even at the same listed rate. usage_events.tokens_in /
 * tokens_out are the source of truth for billed cost — never estimate cost from
 * character counts or pre-tokenizer rules of thumb.
 */

import { MODELS } from "@/lib/llm/models";

// Re-exported for callers that import the pricing shape from here; the type is
// defined on the canonical models source.
export type { ModelPricing } from "@/lib/llm/models";

export const MODEL_PRICING = Object.fromEntries(
  MODELS.map((model) => [model.id, model.pricing]),
) as Record<string, (typeof MODELS)[number]["pricing"]>;

/**
 * Anthropic's web search tool: $10 per 1,000 searches, model-agnostic
 * (current as of April 2026, verified against
 * https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool).
 * Each search counts as one use regardless of how many results return;
 * failed searches are not billed. The token costs of search results
 * (which arrive as input tokens on subsequent turns) are charged
 * separately at the model's normal input rate — not double-billed.
 */
export const WEB_SEARCH_PER_SEARCH_MICRO_USD = 10_000;

/**
 * Compute model call cost in micro-USD ($1 = 1,000,000 micro-USD).
 *
 * Five-component model: regular (uncached) input + cache writes + cache
 * reads + output + web search fees. All count fields default to 0 in
 * practice, so callers that don't use a particular feature pay nothing
 * for it.
 *
 * Math: tokens × dollars-per-million yields micro-USD directly.
 * Token counts are bounded (<200K context per call) so the multiplication
 * stays well within Number's safe-integer range. Web search count is
 * bounded by per-request max_uses (5 in v1).
 *
 * Throws if the model id is not in MODEL_PRICING. The chat route catches
 * this, logs the unknown model, and persists the usage_events row with
 * cost 0 so the token counts still record (Phase 7 observability can
 * backfill cost from a corrected pricing table).
 */
export function computeCostMicroUsd(
  tokensIn: number,
  tokensOut: number,
  cacheCreationTokens: number,
  cacheReadTokens: number,
  webSearchCount: number,
  model: string,
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    throw new Error(`Unknown model for cost calculation: ${model}`);
  }
  return Math.round(
    tokensIn * pricing.inputPerMillion
      + tokensOut * pricing.outputPerMillion
      + cacheCreationTokens * pricing.cacheWritePerMillion
      + cacheReadTokens * pricing.cacheReadPerMillion
      + webSearchCount * WEB_SEARCH_PER_SEARCH_MICRO_USD,
  );
}
