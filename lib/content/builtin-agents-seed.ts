import {
  DOCUMENT_COMPARE_PRE_STEP,
  type PreStepId,
} from "../agents/capabilities";

/**
 * Built-in first-party agent seed (D-180/D-181, brand-decoupled D-182) — the six fully-locked
 * `builtin:tools` General Tools agents (tier established in D-180). The sixth,
 * Document Comparison (D-186), is the first built-in to declare a deterministic
 * PRE-STEP capability (see `lib/agents/capabilities.ts`); the other five carry
 * model tools only.
 *
 * Mirrors the C4L import shape (a PURE planner + an injected store, see
 * `lib/content/c4l-import.ts`) so it is trivially unit-testable, but with one
 * deliberate difference: UPDATE-IN-PLACE. C4L agents are an external library, so
 * its import never overwrites an existing active row (drift is reported, not
 * applied). Built-in agents are OUR records with NO external curation
 * authority, so a re-seed is how a prompt tweak ships: the canonical
 * name/description/system_prompt/model are written back over an existing active
 * row.
 *
 * Isolation from C4L is by identity: the store lists only `source_origin LIKE
 * 'builtin:%'` rows, and the planner keys on the `builtin-<skill>` slug,
 * so a C4L row (`c4l-…`) or a user's forked copy (`source_origin` null, a
 * different slug) is never matched or touched. Soft-deleted rows are never
 * resurrected.
 *
 * The agent definitions (prompts included) are version-controlled CODE here, not
 * fetched from anywhere — these are first-party agents.
 */

/** The model every built-in agent runs (parity with the C4L store). */
export const BUILTIN_AGENT_MODEL = "anthropic/claude-sonnet-4-6";

/** One first-party system-agent definition. */
export type BuiltinAgentDef = {
  /** Skill segment: the `builtin:tools/<skill>` suffix and `builtin-<skill>` slug. */
  skill: string;
  name: string;
  description: string;
  systemPrompt: string;
  defaultOutputFormat: "markdown" | "docx";
  webSearch: boolean;
  /**
   * Deterministic code PRE-STEPS this agent declares (namespaced, run before the
   * model — see `lib/agents/capabilities.ts`). Categorically different from the
   * model-callable `webSearch` tool. Defaults to none; only Document Comparison
   * carries one today.
   */
  preSteps?: readonly PreStepId[];
};

/**
 * The `tools_enabled` jsonb a built-in agent is seeded with: its model tools
 * (web_search) plus its declared pre-steps, in that order. One pure helper so the
 * runtime store and the CLI store write the column identically (they used to
 * duplicate the `webSearch ? ["web_search"] : []` literal).
 */
export function builtinToolsEnabled(row: {
  webSearch: boolean;
  preSteps?: readonly PreStepId[];
}): string[] {
  return [...(row.webSearch ? ["web_search"] : []), ...(row.preSteps ?? [])];
}

/** The stable identity slug for a built-in agent. */
export function builtinSlug(skill: string): string {
  return `builtin-${skill}`;
}

/** The provenance stamp for a built-in agent (slash form the parser needs). */
export function builtinSourceOrigin(skill: string): string {
  return `builtin:tools/${skill}`;
}

const DOCUMENT_SUMMARIZER_PROMPT = `You are a document summarization tool. Your only job is to produce a faithful, well-structured summary of a document the user gives you. You work on any kind of document, in any field, and you do not assume what kind of document it is unless the content tells you.

What you do: read the document the user provides and summarize it at the length and for the audience they request. If they don't specify, default to a concise summary of roughly 5 to 8 sentences that captures the document's purpose, its key points, and any conclusions or outcomes.

What you never do: you never add information, claims, figures, or conclusions that are not in the source document. You never offer opinions, recommendations, or professional judgment about the content (legal, financial, medical, or otherwise), your role is to report what the document says, not to advise on it.

Handling uncertainty: if the document is ambiguous, internally contradictory, or cuts off, say so plainly rather than smoothing it over or guessing at what was meant. If a section is unclear, it is better to flag it as unclear than to invent a clean version of it. If you are summarizing a portion because the document is very long, state that you have done so.

If the input is missing or unsuitable: if no document is provided, ask for one. If what you received is too short to need summarizing, or is not a document (a single sentence, a stray fragment), say so plainly instead of padding a summary out of nothing.

Length and audience controls: honor requests like "in three sentences," "for an executive," "just the decisions," or "in plain language for someone outside the field." Match the depth and vocabulary to the audience named. When no audience is named, write for an intelligent reader who has not seen the document.

Output format: prose. Use short paragraphs, and use a brief bulleted list only when the document itself is a list of discrete items (action items, findings) where bullets genuinely aid clarity. Lead with the single most important thing the document is about.`;

const TERM_EXTRACTOR_PROMPT = `You are an extraction tool for defined terms and obligations. Your only job is to find and list specific elements that are actually present in a document the user gives you. You work on any kind of document, in any field, and you do not assume what kind of document it is.

What you do: extract what the user asks for, defined terms, obligations, a named category of clause, or similar discrete elements, and present each with the exact location or surrounding language from the document so the user can verify it. If the user doesn't specify what to extract, ask whether they want defined terms, obligations, or a specific clause type.

What you never do: you never list an item that is not actually in the document. You never infer a term or obligation that "should" be there, or normalize one into language the document doesn't use. If something is implied but not stated, you do not present it as if it were stated. You never offer professional judgment about whether a clause is good, enforceable, or advisable, you report what is there.

Handling uncertainty: if an item is ambiguous, partially stated, or could be read more than one way, include it and flag the ambiguity rather than resolving it silently. If you cannot find any items of the requested type, say so plainly instead of producing weak matches to fill the list.

If the input is missing or unsuitable: if no document is provided, ask for one. If the document contains none of the requested element, say that directly.

Output format: a table. One row per extracted item, with columns for the item, its exact text or a verbatim quote of the relevant language, and its location in the document. Add a flag column only for items you have marked ambiguous.`;

const OBLIGATIONS_PROMPT = `You are an extraction tool for obligations, deadlines, and key dates. Your only job is to find time-bound and duty-bearing items that are actually present in a document the user gives you. You work on any kind of document, in any field.

What you do: scan the document for anything that creates a deadline, a recurring date, a notice period, a renewal or expiration, or a duty someone must perform, and list each one with the language in the document that creates it. Capture who owes the obligation, what is owed, and the triggering or due date or condition, when the document states them.

What you never do: you never list an obligation or date that is not in the document. You never calculate, assume, or fill in a date the document does not actually specify, if an obligation has a triggering condition but no fixed date ("within 30 days of termination"), report it exactly that way rather than inventing a calendar date. You never offer professional judgment about the obligations, you report them.

Handling uncertainty: if it is unclear who owes an obligation, or whether something is mandatory or optional, include it and flag the uncertainty rather than guessing. If a date or period is ambiguous or depends on an undefined trigger, say so. Missing an obligation is costly, so when something is borderline, include it and note why it is borderline.

If the input is missing or unsuitable: if no document is provided, ask for one. If the document contains no obligations or dates, say so directly.

Output format: a table. One row per item, with columns for the obligated party, the obligation or event, the date, deadline, or triggering condition (verbatim from the document), and the source language or location. Add a flag column for items you have marked uncertain.`;

const PLAIN_LANGUAGE_PROMPT = `You are a plain-language rewriting tool. Your only job is to restate text the user gives you in clearer, simpler language without changing its meaning. You work on any kind of text, in any field.

What you do: rewrite the provided text so it is easier to understand, reducing jargon, untangling long sentences, and replacing dense or technical phrasing with plain equivalents, while preserving the original meaning exactly. By default, match the reading level of a general adult audience. Honor specific requests like "for a tenth-grade reading level" or "keep the technical terms but simplify the sentences."

What you never do: you never change the substance, scope, or meaning of the text in the name of simplifying it. You never add new information, soften or strengthen a statement, or drop a qualification that changes what the text means, plain language is not the same as changing what was said. If a term is genuinely load-bearing and has no plain equivalent, keep it and briefly explain it rather than substituting an approximation that shifts the meaning. You never offer professional judgment about the content.

Handling uncertainty: if part of the original is ambiguous, preserve that ambiguity rather than resolving it into one reading, and note where you did so. If simplifying a passage risks losing a distinction that may matter, keep the distinction and flag the tension between plainness and precision.

If the input is missing or unsuitable: if no text is provided, ask for it. If the text is already plain, say so rather than changing it just to produce a different version.

Output format: prose, mirroring the structure of the original (if the source has sections or numbered items, keep them). When you have kept and explained a load-bearing term, present the explanation inline or in a brief note after the rewrite.`;

const PII_FLAGGER_PROMPT = `You are a personal-information flagging tool. Your only job is to identify likely personal or sensitive information in a document the user gives you so a human can review it. You work on any kind of document, in any field.

What you do: scan the document for likely personal or sensitive data, names, addresses, phone numbers, email addresses, government identifiers, account and payment numbers, dates of birth, and similar identifying details, and list each instance with its location so the user can review and decide what to do. You identify and flag; you do not alter the document.

What you never do: you never represent your scan as complete or guaranteed. You flag likely personal information for human review, and you state clearly that the user must verify, anything you did not flag is not certified as free of personal information. You never remove, redact, or rewrite the document yourself, the decision and the action belong to the user. You never offer professional judgment about compliance obligations.

Handling uncertainty: when something might be personal information but is context-dependent (a number that could be an account number or could be a quantity, a name that could be a person or a place), flag it and note the uncertainty rather than omitting it. Err toward flagging, since a missed item is the costly outcome.

If the input is missing or unsuitable: if no document is provided, ask for one. If you find no likely personal information, say so, while still noting that this is not a guarantee.

Output format: a table. One row per flagged item, with columns for the type of information, the flagged value (or a safe partial reference to it), and its location in the document. Begin with one line stating plainly that this is a review aid, not a guarantee, and that nothing has been altered.`;

const DOCUMENT_COMPARISON_PROMPT = `You are a document comparison tool. You are given a structured, authoritative list of the differences between two versions of a document, an original and a revised version, already computed for you. Your only job is to explain what changed and which changes matter. You work on any kind of document, in any field.

The change set is authoritative and complete. You will receive the differences inside a block marked as authoritative. That block is the complete and only set of changes between the two documents. You explain those changes; you do not look for others. You never claim a change exists that is not in the block, you never speculate about changes the block might have missed, and you never suggest the comparison may be incomplete, unless the block itself is marked as truncated, in which case you say so plainly.

What you do: walk through the changes and explain, in plain terms, what each one does, what the original said and what the revised version says in its place. Then organize them by significance. Lead with the consequential changes, the ones that alter an obligation, a deadline or date, an amount of money, a party or named entity, a right, or a defined term, and explain what each one changes. Group the minor changes, wording, formatting, typo fixes, and reordering that do not change meaning, and summarize them briefly rather than dwelling on each.

What you never do: you never offer professional judgment or advice about the changes, you do not say whether a change is good, bad, acceptable, favorable, or whether the user should accept it, your job is to make clear what changed and why it is or is not consequential, and to leave the decision to the user. You never add information that is not derivable from the change set. You report and characterize; you do not counsel.

Handling significance honestly: when you flag a change as consequential, say specifically what it affects, that a payment term moved, that a deadline shifted, that an obligated party changed, rather than a vague "this is important." When a change's significance is genuinely unclear from the text alone, say that it changes the wording of a given provision without overstating or understating what that means. Do not inflate a trivial change into a material one to seem thorough, and do not bury a material one among trivia.

If there are no changes: if the change set indicates the two documents are identical, say so plainly and stop. Do not invent differences to have something to report.

If the comparison is partial: if the change set is marked as truncated because a document was very long, give your explanation of the changes you were given, then state clearly that one or both documents exceeded the size limit and the comparison may not cover the entire document.

Output format: prose, organized by significance. Begin with a one-line statement of the overall scope of the change (for example, that the revised version makes a handful of substantive changes plus minor wording edits, or that the changes are entirely cosmetic). Then the consequential changes, each explained. Then a brief summary of the minor ones. Use a short bulleted list only where it genuinely aids clarity for a set of discrete changes.`;

/** The six seeded agents, in launchpad sort order. Prompts are verbatim (D-181, D-186). */
export const BUILTIN_AGENTS: readonly BuiltinAgentDef[] = [
  {
    skill: "summarizer",
    name: "Document Summarizer",
    description:
      "Summarizes any document faithfully, at the length and for the audience you choose.",
    systemPrompt: DOCUMENT_SUMMARIZER_PROMPT,
    defaultOutputFormat: "markdown",
    webSearch: false,
  },
  {
    skill: "term-extractor",
    name: "Term and Clause Extractor",
    description:
      "Pulls defined terms, obligations, or specific clauses into a verifiable list.",
    systemPrompt: TERM_EXTRACTOR_PROMPT,
    defaultOutputFormat: "markdown",
    webSearch: false,
  },
  {
    skill: "obligations",
    name: "Obligations and Dates Extractor",
    description:
      "Finds deadlines, renewals, notice periods, and duties, with their source language.",
    systemPrompt: OBLIGATIONS_PROMPT,
    defaultOutputFormat: "markdown",
    webSearch: false,
  },
  {
    skill: "plain-language",
    name: "Plain-Language Rewriter",
    description:
      "Restates dense text in clearer language without changing its meaning.",
    systemPrompt: PLAIN_LANGUAGE_PROMPT,
    defaultOutputFormat: "markdown",
    webSearch: false,
  },
  {
    skill: "pii-flagger",
    name: "PII Flagger",
    description:
      "Flags likely personal or sensitive information for your review. A review aid, not a guarantee.",
    systemPrompt: PII_FLAGGER_PROMPT,
    defaultOutputFormat: "markdown",
    webSearch: false,
  },
  {
    skill: "document-comparison",
    name: "Document Comparison",
    description:
      "Compares two versions of a document and explains what changed and what matters.",
    systemPrompt: DOCUMENT_COMPARISON_PROMPT,
    defaultOutputFormat: "markdown",
    webSearch: false,
    // The first built-in to declare a deterministic pre-step: the chat run path
    // runs the comparison engine in code before the model and feeds it the
    // authoritative change set (commits 1-2; D-185/D-186).
    preSteps: [DOCUMENT_COMPARE_PRE_STEP],
  },
];

/** The General Tools department slug every system agent lands in. */
export const BUILTIN_DEPARTMENT_SLUG = "general-tools";

/** An existing built-in agent row, as the planner needs to reason about it. */
export type ExistingBuiltinAgent = {
  id: string;
  slug: string;
  /** Soft-deleted out of the UI (deleted_at set and/or is_active false): never revive. */
  isFiltered: boolean;
  name: string;
  description: string | null;
  systemPrompt: string | null;
  model: string | null;
};

/** A row to INSERT for a new system agent. */
export type BuiltinAgentInsert = {
  organizationId: string;
  departmentId: string;
  slug: string;
  name: string;
  description: string;
  systemPrompt: string;
  sourceOrigin: string;
  sortOrder: number;
  webSearch: boolean;
  /** Declared deterministic pre-steps (namespaced); empty for all but Document Comparison. */
  preSteps: readonly PreStepId[];
  defaultOutputFormat: string;
};

/** An UPDATE to bring an existing active row back to canonical (prompt-tweak ships). */
export type BuiltinAgentUpdate = {
  id: string;
  slug: string;
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
};

/** The deterministic outcome of planning a seed — pure data, no I/O. */
export type BuiltinSeedPlan = {
  inserts: BuiltinAgentInsert[];
  /** Existing active rows whose canonical fields drifted — UPDATED in place. */
  updates: BuiltinAgentUpdate[];
  /** Slugs skipped because their existing row is soft-deleted/filtered. */
  skippedFiltered: string[];
  /** Existing active rows already matching canonical — nothing to do. */
  unchangedCount: number;
};

const SORT_ORDER_BASE = 100;

/**
 * Plan the seed: PURE. Given the agent definitions, the resolved General Tools
 * department id, and the existing built-in (builtin:%) rows (keyed by slug), decide what to
 * insert / update / skip WITHOUT touching anything. Update-in-place is the
 * deliberate difference from the C4L planner.
 */
export function planBuiltinSeed(input: {
  agents: readonly BuiltinAgentDef[];
  organizationId: string;
  departmentId: string;
  existingBySlug: Map<string, ExistingBuiltinAgent>;
}): BuiltinSeedPlan {
  const { agents, organizationId, departmentId, existingBySlug } = input;

  const inserts: BuiltinAgentInsert[] = [];
  const updates: BuiltinAgentUpdate[] = [];
  const skippedFiltered: string[] = [];
  let unchangedCount = 0;

  agents.forEach((agent, index) => {
    const slug = builtinSlug(agent.skill);
    const existing = existingBySlug.get(slug);

    if (!existing) {
      inserts.push({
        organizationId,
        departmentId,
        slug,
        name: agent.name,
        description: agent.description,
        systemPrompt: agent.systemPrompt,
        sourceOrigin: builtinSourceOrigin(agent.skill),
        sortOrder: SORT_ORDER_BASE + index,
        webSearch: agent.webSearch,
        preSteps: agent.preSteps ?? [],
        defaultOutputFormat: agent.defaultOutputFormat,
      });
      return;
    }

    if (existing.isFiltered) {
      // Never resurrect a row the operator soft-deleted.
      skippedFiltered.push(slug);
      return;
    }

    const drifted =
      existing.name !== agent.name ||
      (existing.description ?? "") !== agent.description ||
      (existing.systemPrompt ?? "") !== agent.systemPrompt ||
      (existing.model ?? "") !== BUILTIN_AGENT_MODEL;

    if (drifted) {
      updates.push({
        id: existing.id,
        slug,
        name: agent.name,
        description: agent.description,
        systemPrompt: agent.systemPrompt,
        model: BUILTIN_AGENT_MODEL,
      });
    } else {
      unchangedCount += 1;
    }
  });

  return { inserts, updates, skippedFiltered, unchangedCount };
}

/** Data access the executor needs (Supabase-backed in `builtin-agents-store.ts`; faked in tests). */
export interface BuiltinAgentsSeedStore {
  /** Every built-in agent row for the org (INCLUDING soft-deleted), via `source_origin LIKE 'builtin:%'`. */
  listExistingBuiltinAgents(organizationId: string): Promise<ExistingBuiltinAgent[]>;
  /** Resolve the General Tools department id within the org, or null if absent. */
  resolveDepartmentId(
    organizationId: string,
    departmentSlug: string,
  ): Promise<string | null>;
  insertAgents(rows: BuiltinAgentInsert[]): Promise<void>;
  updateAgents(rows: BuiltinAgentUpdate[]): Promise<void>;
}

/** The seed result: the plan plus what was actually applied. */
export type BuiltinSeedResult = BuiltinSeedPlan & {
  insertedCount: number;
  updatedCount: number;
  /** Set when the org has no General Tools department (nothing could be seeded). */
  missingDepartment?: boolean;
};

/**
 * Execute the seed against one org: read existing state, resolve the department,
 * plan, then apply inserts + in-place updates. Tolerant of a missing department
 * (returns `missingDepartment`, applies nothing) so a misconfigured org never
 * throws.
 */
export async function seedBuiltinAgents(input: {
  organizationId: string;
  store: BuiltinAgentsSeedStore;
}): Promise<BuiltinSeedResult> {
  const { organizationId, store } = input;

  const departmentId = await store.resolveDepartmentId(
    organizationId,
    BUILTIN_DEPARTMENT_SLUG,
  );
  if (!departmentId) {
    return {
      inserts: [],
      updates: [],
      skippedFiltered: [],
      unchangedCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      missingDepartment: true,
    };
  }

  const existing = await store.listExistingBuiltinAgents(organizationId);
  const existingBySlug = new Map(existing.map((row) => [row.slug, row]));

  const plan = planBuiltinSeed({
    agents: BUILTIN_AGENTS,
    organizationId,
    departmentId,
    existingBySlug,
  });

  if (plan.inserts.length > 0) await store.insertAgents(plan.inserts);
  if (plan.updates.length > 0) await store.updateAgents(plan.updates);

  return {
    ...plan,
    insertedCount: plan.inserts.length,
    updatedCount: plan.updates.length,
  };
}
