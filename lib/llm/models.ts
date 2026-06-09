/**
 * Canonical models source — the single ordered source of truth for every model
 * the product knows about. Pricing and validation, display names, the agent
 * form's full picker, and the composer's quick-pick subset all derive from this
 * list, so adding a model (or, later, sourcing models from a connected provider)
 * is a one-place edit rather than four convention-synced edits.
 *
 * Model ids are vendor-prefixed strings ('anthropic/<model>') per
 * docs/AGENT_ARCHITECTURE.md §6: the vendor segment drives the chat route's
 * dispatcher, the model segment is the native SDK id. parseModelId
 * (lib/llm/parse-model-id.ts) splits the two.
 *
 * This is a pure data module with no server-only imports, so client components
 * (the composer model picker, the agent form) import it directly. It is the
 * intended plug-in point for "models as a connection": when available models
 * come from connected model providers, this list becomes the single seam to
 * swap, and every picker plus the validation layer follow without change.
 *
 * Ordering is intentional and load-bearing: the array order is the display
 * order in the agent form's full picker (flagship first), and filtering by
 * `inComposerQuickPick` preserves it for the composer's quick-pick.
 */

/** Cost rates in USD per 1,000,000 tokens for a single model. */
export type ModelPricing = {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheWritePerMillion: number;
  cacheReadPerMillion: number;
};

/** One model the product can run, with everything its consumers need. */
export type ModelDefinition = {
  /** Vendor-prefixed id, e.g. 'anthropic/claude-opus-4-8'. */
  id: string;
  /** Full product name for surfaces with room, e.g. 'Claude Opus 4.8'. */
  displayName: string;
  /** Short label for tight surfaces (composer trigger), e.g. 'Opus 4.8'. */
  shortDisplayName: string;
  /** One-line helper shown under the option in the agent form's picker. */
  helper: string;
  /** Cost rates, keyed into the cost calculation in lib/llm/pricing.ts. */
  pricing: ModelPricing;
  /**
   * Whether this model appears in the composer's three-model quick-pick.
   * The quick-pick is one-per-tier (flagship / balanced / fast); off-pick
   * models stay reachable through the agent form's full picker.
   */
  inComposerQuickPick: boolean;
};

/**
 * The canonical model list. Order = the agent form's full picker order
 * (flagship first, which is also the default for new agents). Fable 5 is the
 * current flagship; Opus 4.8 / 4.7 / 4.6 remain available in the full picker
 * but not the composer quick-pick (the quick-pick stays one-per-tier:
 * flagship / balanced / fast). Sonnet 4.6 and Haiku 4.5 are unchanged.
 *
 * Fable 5 id and pricing verified against Anthropic's official docs
 * (platform.claude.com models overview + pricing, 2026-06-09): id
 * `claude-fable-5`, $10 / $50 per million in / out, $12.50 five-minute
 * cache write, $1 cache read, 1M context at standard pricing (no
 * long-context premium), 128K max output. Same request surface as
 * Opus 4.8 (no sampling params, adaptive thinking always on), which this
 * integration already satisfies: we send neither sampling params nor a
 * `thinking` field.
 */
export const MODELS: readonly ModelDefinition[] = [
  {
    id: "anthropic/claude-fable-5",
    displayName: "Claude Fable 5",
    shortDisplayName: "Fable 5",
    helper: "Newest and most capable. The default for new agents.",
    pricing: {
      inputPerMillion: 10,
      outputPerMillion: 50,
      cacheWritePerMillion: 12.5,
      cacheReadPerMillion: 1,
    },
    inComposerQuickPick: true,
  },
  {
    id: "anthropic/claude-opus-4-8",
    displayName: "Claude Opus 4.8",
    shortDisplayName: "Opus 4.8",
    helper: "Previous flagship. Strong reasoning at a lower cost.",
    pricing: {
      inputPerMillion: 5,
      outputPerMillion: 25,
      cacheWritePerMillion: 6.25,
      cacheReadPerMillion: 0.5,
    },
    inComposerQuickPick: false,
  },
  {
    id: "anthropic/claude-opus-4-7",
    displayName: "Claude Opus 4.7",
    shortDisplayName: "Opus 4.7",
    helper: "Earlier Opus generation. Strong reasoning for hard tasks.",
    pricing: {
      inputPerMillion: 5,
      outputPerMillion: 25,
      cacheWritePerMillion: 6.25,
      cacheReadPerMillion: 0.5,
    },
    inComposerQuickPick: false,
  },
  {
    id: "anthropic/claude-opus-4-6",
    displayName: "Claude Opus 4.6",
    shortDisplayName: "Opus 4.6",
    helper: "Earlier Opus generation. Use only if a workflow requires it.",
    pricing: {
      inputPerMillion: 5,
      outputPerMillion: 25,
      cacheWritePerMillion: 6.25,
      cacheReadPerMillion: 0.5,
    },
    inComposerQuickPick: false,
  },
  {
    id: "anthropic/claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    shortDisplayName: "Sonnet 4.6",
    helper: "Fast and cost-effective. A balanced choice for most tasks.",
    pricing: {
      inputPerMillion: 3,
      outputPerMillion: 15,
      cacheWritePerMillion: 3.75,
      cacheReadPerMillion: 0.3,
    },
    inComposerQuickPick: true,
  },
  {
    id: "anthropic/claude-haiku-4-5-20251001",
    displayName: "Claude Haiku 4.5",
    shortDisplayName: "Haiku 4.5",
    helper: "Fastest and cheapest. Good for simple tasks at high volume.",
    pricing: {
      inputPerMillion: 1,
      outputPerMillion: 5,
      cacheWritePerMillion: 1.25,
      cacheReadPerMillion: 0.1,
    },
    inComposerQuickPick: true,
  },
];

/**
 * The model new agents start with when nothing more specific applies — the
 * final link in the agent-create precedence (fork template → org default →
 * this constant) and the effective org default shown until a super admin sets
 * one. Replaces the Sonnet 4.6 literal that was previously hardcoded across the
 * codebase. NOT used in the run path: existing conversations keep their frozen
 * model snapshot regardless of this value.
 */
export const DEFAULT_MODEL_FALLBACK = "anthropic/claude-fable-5";

/** Lookup by id, for display and pricing resolution. */
export const MODEL_BY_ID: Record<string, ModelDefinition> = Object.fromEntries(
  MODELS.map((model) => [model.id, model]),
);

/**
 * Every supported model id, in canonical order. The validation trust boundary
 * (the agent server actions' `z.enum`) and the default-model save action both
 * derive their accepted set from this.
 */
export const SUPPORTED_MODEL_IDS: string[] = MODELS.map((model) => model.id);

/** The composer quick-pick ids (flagship / balanced / fast), in canonical order. */
export const COMPOSER_MODEL_IDS: string[] = MODELS.filter(
  (model) => model.inComposerQuickPick,
).map((model) => model.id);

/** Whether a model id is one the product currently supports. */
export function isSupportedModel(id: string): boolean {
  return id in MODEL_BY_ID;
}
