/**
 * Strip the vendor prefix from a stored model id for display.
 *
 *   anthropic/claude-sonnet-4-6 → claude-sonnet-4-6
 *   claude-sonnet-4-6           → claude-sonnet-4-6   (no slash, returned as-is)
 *   null                        → ""
 *
 * Callers: chat agent header's META chip, chat composer model picker
 * (Session 17a). Pure string transform — no validation; the model id
 * should already have been validated against MODEL_PRICING at write time.
 *
 * For a friendly product-name (e.g. "Claude Sonnet 4.6") rather than the
 * raw id, use modelDisplayName / modelDisplayNameShort below.
 */
export function modelLabel(model: string | null): string {
  if (!model) return "";
  const slash = model.indexOf("/");
  return slash === -1 ? model : model.slice(slash + 1);
}

/**
 * Friendly product-name for a model id, used wherever marketing-shape
 * naming reads better than the raw id (chat empty-state facts row, agent
 * edit form select, anywhere we surface the model to the end user).
 *
 * Two named functions instead of one variant-arg function so each
 * consumer's intent is grep-able. Short-form (modelDisplayNameShort)
 * drops the "Claude " prefix for tight surfaces like the composer's
 * model-picker trigger; long-form keeps it for surfaces with room.
 *
 * Unknown ids fall through to modelLabel() — better to surface the raw
 * stripped id than render a placeholder; users who picked an off-list
 * model via the form should still see what they have.
 */
const MODEL_DISPLAY_NAMES: Record<string, { full: string; short: string }> = {
  "anthropic/claude-sonnet-4-6": {
    full: "Claude Sonnet 4.6",
    short: "Sonnet 4.6",
  },
  "anthropic/claude-opus-4-7": {
    full: "Claude Opus 4.7",
    short: "Opus 4.7",
  },
  "anthropic/claude-opus-4-6": {
    full: "Claude Opus 4.6",
    short: "Opus 4.6",
  },
  "anthropic/claude-haiku-4-5-20251001": {
    full: "Claude Haiku 4.5",
    short: "Haiku 4.5",
  },
};

export function modelDisplayName(model: string | null): string {
  if (!model) return "";
  return MODEL_DISPLAY_NAMES[model]?.full ?? modelLabel(model);
}

export function modelDisplayNameShort(model: string | null): string {
  if (!model) return "";
  return MODEL_DISPLAY_NAMES[model]?.short ?? modelLabel(model);
}
