/**
 * Strip the vendor prefix from a stored model id for display.
 *
 *   anthropic/claude-sonnet-4-6 → claude-sonnet-4-6
 *   claude-sonnet-4-6           → claude-sonnet-4-6   (no slash, returned as-is)
 *   null                        → ""
 *
 * Two consumers today: the chat agent header's META chip and the chat
 * composer's model picker (session 17a). The function is a pure string
 * transform — no validation; the model id should already have been
 * validated against MODEL_PRICING at write time.
 */
export function modelLabel(model: string | null): string {
  if (!model) return "";
  const slash = model.indexOf("/");
  return slash === -1 ? model : model.slice(slash + 1);
}
