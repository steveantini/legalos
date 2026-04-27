/**
 * Per-model Anthropic cost rates in USD per 1,000,000 tokens. Current as of
 * April 2026 — updating rates is a code change. Multi-provider normalized
 * cost is deferred to Phase 6 per D-023.
 *
 * NOTE on Opus 4.7 tokenization: Anthropic introduced a new tokenizer with
 * Opus 4.7 that can produce up to ~35% more tokens for the same source text
 * vs. older models. Real cost per request can vary noticeably even at the
 * same listed rate. usage_events.tokens_in / tokens_out are the source of
 * truth for billed cost — never estimate cost from character counts or
 * pre-tokenizer rules of thumb.
 */

export type ModelPricing = {
  inputPerMillion: number;
  outputPerMillion: number;
};

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-7":            { inputPerMillion: 5, outputPerMillion: 25 },
  "claude-opus-4-6":            { inputPerMillion: 5, outputPerMillion: 25 },
  "claude-sonnet-4-6":          { inputPerMillion: 3, outputPerMillion: 15 },
  "claude-haiku-4-5-20251001":  { inputPerMillion: 1, outputPerMillion: 5  },
};

/**
 * Compute Anthropic call cost in micro-USD ($1 = 1,000,000 micro-USD).
 *
 * Math: tokens × dollars-per-million yields micro-USD directly.
 * Token counts are bounded (<200K context per call) so the multiplication
 * stays well within Number's safe-integer range.
 *
 * Throws if the model id is not in MODEL_PRICING. The chat route catches
 * this, logs the unknown model, and persists the usage_events row with
 * cost 0 so the token counts still record (Phase 7 observability can
 * backfill cost from a corrected pricing table).
 */
export function computeCostMicroUsd(
  tokensIn: number,
  tokensOut: number,
  model: string,
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    throw new Error(`Unknown model for cost calculation: ${model}`);
  }
  return Math.round(
    tokensIn * pricing.inputPerMillion + tokensOut * pricing.outputPerMillion,
  );
}
