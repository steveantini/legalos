import type { VendorContentProvider } from "@/lib/content/vendor-registry";

/**
 * Safe, placement-preserving C4L content import (C4L/platform arc, Step 2).
 *
 * This is the reusable core a future platform-owner refresh button (Step 3) will
 * call. Step 2 builds ONLY the safe logic + its seam: there is NO button, route,
 * UI, or GitHub fetch here. The caller supplies already-parsed skills (Step 3
 * feeds them from a GitHub fetch; the CLI feeds them from the local clone), so
 * this module owns the one thing that must be correct before any trigger exists:
 * the SAFE UPSERT.
 *
 * Design: a PURE planner (`planC4LImport`) holds all the safety logic and is
 * trivially unit-testable; a thin executor (`importC4LContent`) reads existing
 * state through an injected `C4LImportStore` and applies the plan. Step 3
 * provides a Supabase-backed store; tests provide a fake.
 *
 * SAFETY RULES (the whole point of Step 2):
 *   a. NEVER resurrect a soft-deleted/curated row. A slug whose existing row was
 *      soft-deleted (the operator's `0024`-style filter) is skipped — its
 *      is_active/deleted_at are never touched.
 *   b. PRESERVE placement from the persisted `pluginDepartmentMap`, never a
 *      one-off argument: new agents are inserted into their plugin's mapped
 *      department.
 *   c. DON'T clobber admin edits: an existing ACTIVE row is NEVER modified. If
 *      its source-owned content (name/description/system_prompt) differs from
 *      upstream, that is REPORTED (`updatesAvailable`) for an explicit later
 *      review/apply step, never auto-overwritten. So admin edits, admin moves
 *      (placement), active/filter state, and admin-tuned fields are all
 *      preserved across a refresh.
 *   d. IDEMPOTENT + STABLE: the slug `c4l-<plugin>-<skill>` is the identity, so a
 *      re-import inserts only genuinely new skills and is otherwise a no-op —
 *      nothing is deleted or recreated, so conversation history (which
 *      references agent ids) is never broken.
 *
 * UNCATEGORIZED PLUGINS (Part 3): a plugin present in the source but ABSENT from
 * the provider's `pluginDepartmentMap` is collected into `unmappedPlugins` and
 * imported NOWHERE — never guessed into a department, never dropped silently —
 * so Step 3 can ask the platform owner to assign or skip it.
 */

/** One parsed C4L skill — the import's input unit (Step 3 fetches these). */
export type ParsedC4LSkill = {
  /** Plugin slug, e.g. "commercial-legal". */
  plugin: string;
  /** Skill directory name, e.g. "nda-review". */
  skill: string;
  /** Frontmatter name → the agent's display name. */
  name: string;
  /** First paragraph of the frontmatter description → the agent description. */
  description: string;
  /** Markdown body → the agent's system prompt. */
  systemPrompt: string;
};

/** An existing C4L agent row, as the planner needs to reason about it. */
export type ExistingC4LAgent = {
  id: string;
  slug: string;
  departmentId: string | null;
  /**
   * True when the operator has soft-deleted this row out of the department UI
   * (deleted_at set, and/or is_active false) — the curation signal the import
   * must respect by never reactivating.
   */
  isFiltered: boolean;
  name: string;
  description: string | null;
  systemPrompt: string | null;
};

/** A row to INSERT for a brand-new C4L skill (placement from the mapping). */
export type C4LAgentInsert = {
  organizationId: string;
  departmentId: string;
  slug: string;
  name: string;
  description: string;
  systemPrompt: string;
  /** "<providerId>:<plugin>/<skill>" provenance stamp. */
  sourceOrigin: string;
  sortOrder: number;
};

/** A source-owned content difference on an existing ACTIVE row (reported, not applied). */
export type C4LContentUpdate = {
  slug: string;
  agentId: string;
  /** Which source-owned fields differ: any of "name" | "description" | "system_prompt". */
  changedFields: string[];
};

/** The deterministic outcome of planning an import — pure data, no I/O. */
export type C4LImportPlan = {
  /** New skills to insert, placed via the mapping. */
  inserts: C4LAgentInsert[];
  /** Slugs skipped because their existing row is soft-deleted/filtered (rule a). */
  skippedFiltered: string[];
  /** Plugins in the source with no department mapping — imported nowhere (Part 3). */
  unmappedPlugins: string[];
  /** Existing active rows whose upstream content differs — reported, not applied (rule c). */
  updatesAvailable: C4LContentUpdate[];
  /** Existing active rows already matching upstream — nothing to do. */
  unchangedCount: number;
};

const SORT_ORDER_BASE = 100;

/** The stable identity slug for a C4L skill (rule d). */
export function c4lSlug(plugin: string, skill: string): string {
  return `c4l-${plugin}-${skill}`;
}

/** The provenance stamp for a C4L skill. */
export function c4lSourceOrigin(
  providerId: string,
  plugin: string,
  skill: string,
): string {
  return `${providerId}:${plugin}/${skill}`;
}

/** The source-owned fields (from the upstream SKILL.md) that differ on a row. */
function changedSourceOwnedFields(
  existing: ExistingC4LAgent,
  skill: ParsedC4LSkill,
): string[] {
  const changed: string[] = [];
  if ((existing.name ?? "") !== skill.name) changed.push("name");
  if ((existing.description ?? "") !== skill.description) {
    changed.push("description");
  }
  if ((existing.systemPrompt ?? "") !== skill.systemPrompt) {
    changed.push("system_prompt");
  }
  return changed;
}

/**
 * Plan a C4L import: PURE — given the parsed skills, the provider (with its
 * placement mapping), the resolved department ids, and the existing C4L rows, it
 * decides what to insert / skip / report WITHOUT touching anything. All four
 * safety rules live here, so they can be unit-tested without a database.
 */
export function planC4LImport(input: {
  skills: ParsedC4LSkill[];
  provider: VendorContentProvider;
  organizationId: string;
  /** Resolved department slug → id, for the provider's mapped departments. */
  departmentIdBySlug: Record<string, string>;
  /** Existing C4L agents (INCLUDING soft-deleted), keyed by slug. */
  existingBySlug: Map<string, ExistingC4LAgent>;
}): C4LImportPlan {
  const { skills, provider, organizationId, departmentIdBySlug, existingBySlug } =
    input;

  const inserts: C4LAgentInsert[] = [];
  const skippedFiltered: string[] = [];
  const unmappedPlugins = new Set<string>();
  const updatesAvailable: C4LContentUpdate[] = [];
  let unchangedCount = 0;

  for (const skill of skills) {
    // Rule b / Part 3: placement comes ONLY from the persisted mapping. A plugin
    // with no mapping (or whose mapped department can't be resolved) is reported
    // and imported nowhere — never guessed, never dropped silently.
    const departmentSlug = provider.pluginDepartmentMap[skill.plugin];
    const departmentId = departmentSlug
      ? departmentIdBySlug[departmentSlug]
      : undefined;
    if (!departmentId) {
      unmappedPlugins.add(skill.plugin);
      continue;
    }

    const slug = c4lSlug(skill.plugin, skill.skill);
    const existing = existingBySlug.get(slug);

    if (!existing) {
      // Genuinely new skill → insert, placed via the mapping.
      inserts.push({
        organizationId,
        departmentId,
        slug,
        name: skill.name,
        description: skill.description,
        systemPrompt: skill.systemPrompt,
        sourceOrigin: c4lSourceOrigin(
          provider.providerId,
          skill.plugin,
          skill.skill,
        ),
        sortOrder: SORT_ORDER_BASE + inserts.length,
      });
      continue;
    }

    if (existing.isFiltered) {
      // Rule a: NEVER reactivate a row the operator soft-deleted.
      skippedFiltered.push(slug);
      continue;
    }

    // Rule c: existing ACTIVE row is never modified. Report content drift only.
    const changedFields = changedSourceOwnedFields(existing, skill);
    if (changedFields.length > 0) {
      updatesAvailable.push({ slug, agentId: existing.id, changedFields });
    } else {
      unchangedCount += 1;
    }
  }

  return {
    inserts,
    skippedFiltered,
    unmappedPlugins: [...unmappedPlugins],
    updatesAvailable,
    unchangedCount,
  };
}

/**
 * Data access the executor needs. Step 3 backs this with a service-role Supabase
 * client (org MCP/content reads are service-side); tests back it with a fake.
 */
export interface C4LImportStore {
  /** Every C4L agent row for the org, INCLUDING soft-deleted ones. */
  listExistingC4LAgents(organizationId: string): Promise<ExistingC4LAgent[]>;
  /** Resolve department slugs to ids within the org (mapped departments only). */
  resolveDepartmentIds(
    organizationId: string,
    departmentSlugs: string[],
  ): Promise<Record<string, string>>;
  /** Insert the planned new agent rows. */
  insertAgents(rows: C4LAgentInsert[]): Promise<void>;
}

/** The import result: the plan plus what was actually applied. */
export type C4LImportResult = C4LImportPlan & { insertedCount: number };

/**
 * Execute a safe C4L import: read existing state through the store, plan via
 * `planC4LImport`, apply the inserts, and return the summary. No button, route,
 * UI, or GitHub fetch — Step 3 supplies the store + the fetched skills.
 */
export async function importC4LContent(input: {
  skills: ParsedC4LSkill[];
  provider: VendorContentProvider;
  organizationId: string;
  store: C4LImportStore;
}): Promise<C4LImportResult> {
  const { skills, provider, organizationId, store } = input;

  const existing = await store.listExistingC4LAgents(organizationId);
  const existingBySlug = new Map(existing.map((row) => [row.slug, row]));

  const mappedDepartmentSlugs = [
    ...new Set(Object.values(provider.pluginDepartmentMap)),
  ];
  const departmentIdBySlug = await store.resolveDepartmentIds(
    organizationId,
    mappedDepartmentSlugs,
  );

  const plan = planC4LImport({
    skills,
    provider,
    organizationId,
    departmentIdBySlug,
    existingBySlug,
  });

  if (plan.inserts.length > 0) {
    await store.insertAgents(plan.inserts);
  }

  return { ...plan, insertedCount: plan.inserts.length };
}
