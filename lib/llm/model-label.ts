import { MODEL_BY_ID } from "@/lib/llm/models";

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
 *
 * Names come from the canonical models source (lib/llm/models.ts), so the
 * pickers, validation, and these labels can never carry different model sets.
 */
export function modelDisplayName(model: string | null): string {
  if (!model) return "";
  return MODEL_BY_ID[model]?.displayName ?? modelLabel(model);
}

export function modelDisplayNameShort(model: string | null): string {
  if (!model) return "";
  return MODEL_BY_ID[model]?.shortDisplayName ?? modelLabel(model);
}
