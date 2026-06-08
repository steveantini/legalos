/**
 * Vendor-prefixed model id parser per docs/AGENT_ARCHITECTURE.md §6.
 *
 * Model ids in this codebase are vendor-namespaced strings of the form
 * 'anthropic/claude-sonnet-4-6' — vendor segment, slash, model segment. The
 * vendor segment drives the dispatcher in app/api/chat/route.ts; the model
 * segment is what gets passed to the vendor's SDK as its native model id.
 *
 * The bare-id fallback below is a transitional shim for the migration 0005
 * cutover window — it lets new code read pre-migration data without
 * producing a chat outage if the deploy lands before the SQL migration is
 * applied. Once the cutover is complete and we are confident no bare-id
 * rows can exist anywhere (agents.model, conversations.model_snapshot,
 * usage_events.model), the fallback is safe to remove in a future cleanup
 * session.
 */

export type ParsedModelId = {
  vendor: string;
  model: string;
};

/**
 * Parse a vendor-prefixed model id into its vendor and model segments.
 *
 * Throws on a malformed prefixed id (multiple slashes, empty model segment,
 * or vendor segment containing characters outside [a-z0-9_-]). The chat
 * route already wraps requests in a try/catch and returns 'internal_error'
 * to the client; logs see the offending raw value for debugging.
 *
 * Accepts a bare id (no slash) and treats it as 'anthropic/<id>' — see the
 * file header for the cutover-window rationale.
 */
export function parseModelId(raw: string): ParsedModelId {
  const slashIdx = raw.indexOf("/");

  if (slashIdx === -1) {
    // Backward-compat for the migration 0005 cutover window. Safe to remove
    // once no bare-id rows can exist in agents.model, conversations.
    // model_snapshot, or usage_events.model.
    return { vendor: "anthropic", model: raw };
  }

  const vendor = raw.slice(0, slashIdx);
  const model = raw.slice(slashIdx + 1);

  if (!/^[a-z0-9_-]+$/.test(vendor)) {
    throw new Error(`Invalid model id: vendor segment "${vendor}" in "${raw}"`);
  }
  if (model.length === 0) {
    throw new Error(`Invalid model id: empty model segment in "${raw}"`);
  }
  if (model.includes("/")) {
    throw new Error(`Invalid model id: multiple slashes in "${raw}"`);
  }

  return { vendor, model };
}
