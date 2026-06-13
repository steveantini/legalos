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
   * Whether this model appears in the composer's quick-pick. The quick-pick
   * mirrors the selectable set (currently both flagships, Fable 5 and
   * Opus 4.8, plus Sonnet 4.6 and Haiku 4.5); off-pick models stay reachable
   * through the agent form's full picker.
   */
  inComposerQuickPick: boolean;
  /**
   * Whether this model is offered for NEW selection (pickers, the org
   * default-model control, fresh agent creation). Unselectable models stay
   * in this list so their pricing keeps computing for historical
   * usage_events and their display names keep rendering, and so existing
   * agents configured on them keep saving (the agent write actions validate
   * against the full known set, not the selectable subset). An agent on an
   * unselectable model keeps working; it just can't be newly chosen.
   */
  selectable: boolean;
};

/**
 * The canonical model list. Order = the agent form's full picker order
 * (flagship first). The selectable set is the four current choices:
 * Fable 5 and Opus 4.8 (flagship), Sonnet 4.6 (balanced), Haiku 4.5 (fast).
 * Opus 4.8 is the code default (DEFAULT_MODEL_FALLBACK) because Fable 5 is
 * presently unavailable to all users (a government-driven halt, possibly
 * temporary, D-164). Fable 5 is deliberately RETAINED as a selectable choice
 * with its pricing intact so that if availability returns it can be made the
 * default again with a one-line change rather than a rebuild. The older Opus
 * generations (4.7 / 4.6) are retained but unselectable: their pricing must
 * keep computing for historical usage_events, and agents already configured
 * on them keep working.
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
    helper: "Newest and most capable.",
    pricing: {
      inputPerMillion: 10,
      outputPerMillion: 50,
      cacheWritePerMillion: 12.5,
      cacheReadPerMillion: 1,
    },
    inComposerQuickPick: true,
    selectable: true,
  },
  {
    id: "anthropic/claude-opus-4-8",
    displayName: "Claude Opus 4.8",
    shortDisplayName: "Opus 4.8",
    helper: "Strong reasoning. The default for new agents.",
    pricing: {
      inputPerMillion: 5,
      outputPerMillion: 25,
      cacheWritePerMillion: 6.25,
      cacheReadPerMillion: 0.5,
    },
    inComposerQuickPick: true,
    selectable: true,
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
    selectable: false,
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
    selectable: false,
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
    selectable: true,
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
    selectable: true,
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
export const DEFAULT_MODEL_FALLBACK = "anthropic/claude-opus-4-8";

/** Lookup by id, for display and pricing resolution. */
export const MODEL_BY_ID: Record<string, ModelDefinition> = Object.fromEntries(
  MODELS.map((model) => [model.id, model]),
);

/**
 * Every KNOWN model id, in canonical order — the selectable set plus the
 * retained unselectable ones. The agent server actions' `z.enum` validates
 * against this, deliberately: an existing agent configured on an
 * unselectable model must keep saving (its model rides along on every edit
 * submit). NEW-selection surfaces validate against SELECTABLE_MODEL_IDS
 * instead.
 */
export const SUPPORTED_MODEL_IDS: string[] = MODELS.map((model) => model.id);

/**
 * The models offered for new selection, in canonical order. Every picker
 * (agent form, org default-model control) renders from this; the
 * default-model save action validates against the id list.
 */
export const SELECTABLE_MODELS: readonly ModelDefinition[] = MODELS.filter(
  (model) => model.selectable,
);

/** The selectable ids, for new-selection validation (z.enum). */
export const SELECTABLE_MODEL_IDS: string[] = SELECTABLE_MODELS.map(
  (model) => model.id,
);

/** The composer quick-pick ids (flagship / balanced / fast), in canonical order. */
export const COMPOSER_MODEL_IDS: string[] = MODELS.filter(
  (model) => model.inComposerQuickPick,
).map((model) => model.id);

/** Whether a model id is one the product knows about (incl. unselectable). */
export function isSupportedModel(id: string): boolean {
  return id in MODEL_BY_ID;
}

/** Whether a model id may be newly selected. */
export function isSelectableModel(id: string): boolean {
  return MODEL_BY_ID[id]?.selectable === true;
}
