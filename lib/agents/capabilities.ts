/**
 * Agent capabilities — the two CATEGORICALLY DIFFERENT kinds of capability an
 * agent can carry. Both are stored in the same `agents.tools_enabled` jsonb array,
 * but they are never the same kind of thing:
 *
 *   - MODEL TOOLS (e.g. "web_search"): handed to the MODEL as callable tools. The
 *     model decides, mid-turn, whether to invoke them.
 *   - DETERMINISTIC PRE-STEPS (namespaced "prestep:*"): pure code operations that
 *     run UNCONDITIONALLY, in code, BEFORE the model call. The model never "calls"
 *     a pre-step; it receives the pre-step's structured result as AUTHORITATIVE
 *     input and explains it. It cannot ride past or override that result.
 *     (See lib/deterministic/README.md and DECISION_LOG: the deterministic
 *     pre-step pattern.)
 *
 * Why one column, not two:
 *   - The "prestep:" namespace makes the two kinds distinguishable AT A GLANCE in
 *     the stored row, and parseAgentCapabilities() keeps them distinct IN CODE —
 *     no consumer ever treats a pre-step as a model tool, or a model tool as a
 *     pre-step. That is the distinguishability the design requires.
 *   - Every existing model-tool consumer tests `tools_enabled.includes("web_search")`
 *     (or renders web_search). A namespaced "prestep:*" entry never matches those
 *     checks, so adding pre-steps does not disturb the ~existing consumers — no
 *     migration, and no risk to the chat hot path, which already selects this
 *     column on every request.
 *   - A pre-step DECLARATION is structurally identical to what tools_enabled
 *     already holds: a bare identifier in a list. (Contrast MCP, which needed its
 *     own column, `enabled_mcp_servers`, because it carries per-server config and
 *     policy — richer than a bare flag. A pre-step is just a flag, so it fits here.)
 *
 * This is deliberately NOT a registry or a pre-step framework: ONE pre-step exists
 * today (document comparison). A second (e.g. Knowledge search) will be one more
 * constant in PRE_STEP_IDS and one more branch where pre-steps run — no scaffolding
 * before there are two real tenants to generalize from.
 */

/** Namespace marking a tools_enabled entry as a code PRE-STEP, not a model tool. */
export const PRE_STEP_NAMESPACE = "prestep:";

/** The deterministic document-comparison pre-step (the first and only one today). */
export const DOCUMENT_COMPARE_PRE_STEP = "prestep:document_compare";

/** Every pre-step id this build knows how to run. Grows by one when a 2nd lands. */
export const PRE_STEP_IDS = [DOCUMENT_COMPARE_PRE_STEP] as const;

/** A pre-step identifier this build recognizes. */
export type PreStepId = (typeof PRE_STEP_IDS)[number];

export type AgentCapabilities = {
  /** Entries offered to the MODEL as callable tools (e.g. "web_search"). */
  readonly modelTools: readonly string[];
  /** Known deterministic pre-steps to run, in code, BEFORE the model. */
  readonly preSteps: readonly PreStepId[];
};

function isPreStepId(entry: string): entry is PreStepId {
  return (PRE_STEP_IDS as readonly string[]).includes(entry);
}

/**
 * Partition an agent's tools_enabled jsonb into the two capability kinds. Tolerant
 * of the column's `unknown` shape: a non-array yields empty lists, and non-string
 * members are skipped. UNKNOWN "prestep:*" tokens are dropped from BOTH lists — a
 * token this build does not recognize is never offered to the model as a tool (it
 * is not one) and never run as a pre-step (we do not know how). Forward-compatible
 * and fail-safe: a newer pre-step id on an older deploy is simply inert.
 */
export function parseAgentCapabilities(toolsEnabled: unknown): AgentCapabilities {
  const raw = Array.isArray(toolsEnabled)
    ? toolsEnabled.filter((e): e is string => typeof e === "string")
    : [];
  const modelTools: string[] = [];
  const preSteps: PreStepId[] = [];
  for (const entry of raw) {
    if (entry.startsWith(PRE_STEP_NAMESPACE)) {
      if (isPreStepId(entry) && !preSteps.includes(entry)) preSteps.push(entry);
      // Unknown "prestep:*" tokens are intentionally dropped (see doc comment).
    } else {
      modelTools.push(entry);
    }
  }
  return { modelTools, preSteps };
}

/** True iff the agent declares the document-comparison deterministic pre-step. */
export function hasDocumentComparePreStep(toolsEnabled: unknown): boolean {
  return parseAgentCapabilities(toolsEnabled).preSteps.includes(
    DOCUMENT_COMPARE_PRE_STEP,
  );
}

/**
 * Rebuild `tools_enabled` when an agent FORM re-saves a row. The agent form only
 * renders MODEL-SIDE tools (today, the web-search toggle), so a naive rebuild
 * (`webSearch ? ["web_search"] : []`) silently DROPS every capability kind the
 * form does not control — which, before this helper, wiped a forked Document
 * Comparison agent's `prestep:document_compare` on its first edit, turning it into
 * a prose agent that claims an authoritative change set it never receives.
 *
 * The robust fix (D-188): reconstruct ONLY the model-tool portion from the form,
 * and preserve every entry in the PRE-STEP NAMESPACE verbatim. Preservation keys
 * on the `prestep:` namespace, NOT the known-id partition (parseAgentCapabilities,
 * which intentionally drops unknown pre-steps so the runtime never offers/runs what
 * it cannot understand). For preservation we want the opposite posture: keep even a
 * `prestep:*` this build does not yet recognize, so a newer pre-step on an older
 * deploy is never wiped by an edit. This preserves any capability the form cannot
 * render, generically (not just `document_compare`, but a future second pre-step,
 * known or not). Pure; the single source of truth both create and update call so
 * they cannot drift.
 */
export function rebuildToolsEnabled(
  existingTools: unknown,
  modelTools: { webSearch: boolean },
): string[] {
  const existing = Array.isArray(existingTools)
    ? existingTools.filter((e): e is string => typeof e === "string")
    : [];
  const preservedPreSteps = existing.filter((e) =>
    e.startsWith(PRE_STEP_NAMESPACE),
  );
  const model = modelTools.webSearch ? ["web_search"] : [];
  return [...model, ...preservedPreSteps];
}
