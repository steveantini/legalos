import { BUILTIN_SOURCE_ID } from "@/lib/content/vendor-registry";

import { extractSourceId, getSourceDisplayLabel } from "./source";

/**
 * The agent edit-lock tiers, by `source_origin`. Two locked tiers exist:
 *
 *   - FULLY LOCKED (built-in tier, `builtin:...`): nothing is user-
 *     editable. The only way to adapt one is to Copy it into an org-owned
 *     agent (the fork clears `source_origin`, yielding a normal editable
 *     My-agent). Stricter than the C4L hybrid lock.
 *   - HYBRID (Claude for Legal, `claude-for-legal:...`): name, description,
 *     system prompt, and web search are managed upstream and locked; model,
 *     attached references, and output format stay editable (the admin's
 *     adjust-to-your-org levers).
 *
 * A null `source_origin` (native canonical/personal agent) is not locked.
 *
 * Pure so both the server action (`updateAgentAction`) and the editor UI can
 * agree on the same rule, and so the rule is unit-testable without a database.
 */

/** True when a `source_origin` belongs to the fully-locked built-in tier. */
export function isFullyLockedSource(sourceOrigin: string | null): boolean {
  if (!sourceOrigin) return false;
  // extractSourceId reads only the prefix before the colon, so this holds even
  // for the malformed `builtin:tools` (no slash) form, not just the canonical
  // `builtin:tools/<skill>`.
  return extractSourceId(sourceOrigin) === BUILTIN_SOURCE_ID;
}

/** The managed fields the hybrid (C4L) lock compares; model/output stay editable. */
export type SourcedAgentFields = {
  name: string;
  /** Normalized to "" when null. */
  description: string;
  /** Normalized to "" when null. */
  systemPrompt: string;
  webSearch: boolean;
};

export type AgentEditLockResult = { ok: true } | { ok: false; formError: string };

/**
 * Decide whether an edit to a sourced agent is allowed. Returns `ok` for a
 * native (null-source) agent or a hybrid agent whose locked fields are
 * unchanged; otherwise an `ok: false` with the user-facing reason.
 *
 * Fully-locked agents reject ANY submit (no field is editable, including model
 * and output format) — the server short-circuits before writing anything.
 */
export function evaluateAgentEditLock(
  sourceOrigin: string | null,
  db: SourcedAgentFields,
  submitted: SourcedAgentFields,
): AgentEditLockResult {
  if (sourceOrigin === null) return { ok: true };

  if (isFullyLockedSource(sourceOrigin)) {
    return {
      ok: false,
      formError:
        "This agent is provided by legalOS and can't be edited. Copy it to make your own editable version.",
    };
  }

  const lockedChanges: string[] = [];
  if (submitted.name !== db.name) lockedChanges.push("name");
  if (submitted.description !== db.description) lockedChanges.push("description");
  if (submitted.systemPrompt !== db.systemPrompt) {
    lockedChanges.push("system prompt");
  }
  if (submitted.webSearch !== db.webSearch) lockedChanges.push("web search");
  if (lockedChanges.length === 0) return { ok: true };

  const label = getSourceDisplayLabel(extractSourceId(sourceOrigin));
  return {
    ok: false,
    formError: `These fields are managed by ${label} and can't be changed: ${lockedChanges.join(", ")}. Refresh and try again.`,
  };
}
