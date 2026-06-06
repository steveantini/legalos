/**
 * Type-safe registry of preference keys.
 *
 * Every preference the application reads or writes is declared here.
 * Keys follow a namespaced convention: `<surface>:<scope>:<name>`.
 *
 * Examples:
 *   ui:dept:<slug>:collapsed_sections        per-department UI state
 *   agent:default_model                       user's preferred default model
 *   agent:default_output_format               user's preferred output format
 *   chat:show_token_counts                    show token-count UI in chat
 *
 * The registry serves three purposes:
 *
 *   1. Single source of truth for known keys (prevents typos and
 *      accidental key proliferation).
 *   2. Type narrowing — callers import the helper / constant + the
 *      paired value interface so `getUserPreferenceAction<T>` returns
 *      the right shape.
 *   3. Discoverability — engineers see every preference the app
 *      supports by reading this file.
 *
 * Adding a new preference: add the key helper/constant here, declare
 * the paired value interface, and use both wherever the preference is
 * read or written.
 */

/**
 * Build a key for the per-department collapsed-sections preference.
 *
 * Stored value matches `CollapsedSectionsValue` below. `true` means
 * "collapsed"; `false` / absent means "expanded". Absent keys read as
 * the default (every section expanded).
 */
export function deptCollapsedSectionsKey(departmentSlug: string): string {
  return `ui:dept:${departmentSlug}:collapsed_sections`;
}

/**
 * Shape stored under `deptCollapsedSectionsKey(...)`: a map of section key →
 * collapsed flag, each independent so collapsing one section doesn't touch the
 * others. An explicit string index signature (rather than fixed named fields)
 * so it holds the launchpad's per-vendor content sections too (Step 4): the
 * known keys are `departmentAgents`, `externalAgents` (the legacy / claude-for-legal
 * external section), `myAgents`, and `external:<sourceId>` for additional vendor
 * content providers. The index signature also satisfies the `PreferenceValue`
 * generic constraint on the user-preferences server actions.
 */
export type CollapsedSectionsValue = {
  [sectionKey: string]: boolean | undefined;
};

/**
 * Per-user preference key for the Workflows screen's collapsed sections.
 * Single global key (the screen is one surface, unlike the per-department
 * launchpad). Stored value matches `CollapsedSectionsValue`; the known
 * section key is `templates` (the "Start from a template" section that sits
 * under the user's workflow list).
 */
export const workflowsCollapsedSectionsKey = "ui:workflows:collapsed_sections";

/**
 * Per-user preference key for rail group collapsed state. Single global
 * key (not per-department, unlike the launchpad's collapsed-sections
 * preference) because the rail is global chrome — the same rail renders
 * everywhere in the workspace, so its collapse state is a property of
 * the user, not the surface.
 *
 * Value matches `RailGroupsCollapsedValue` below. `true` means
 * "collapsed"; `false` / absent means "expanded". Absent keys read as
 * the default (every group expanded).
 *
 * The Workspace single-link group at the top of the rail is not
 * collapsible — single link, no caption, nothing to collapse. Only
 * multi-leaf groups participate in this preference.
 */
export const railGroupsCollapsedKey = "ui:rail:groups_collapsed";

/**
 * Shape stored under `railGroupsCollapsedKey`. Each group flag is
 * independent so the user can collapse one group without touching the
 * others' state.
 *
 * Declared as a type alias (not an interface) so the implicit index
 * signature lets it satisfy the `PreferenceValue` generic constraint
 * on the user-preferences server actions — same reason as
 * `CollapsedSectionsValue` above.
 */
export type RailGroupsCollapsedValue = {
  departments?: boolean;
  knowledge?: boolean;
  workflows?: boolean;
  integrations?: boolean;
  help?: boolean;
};

// Future keys will live alongside the above. Sketches (not in use yet):
//
//   export const AGENT_DEFAULT_MODEL_KEY = "agent:default_model";
//   export type AgentDefaultModelValue = string; // a model id
//
//   export const AGENT_DEFAULT_OUTPUT_FORMAT_KEY = "agent:default_output_format";
//   export type AgentDefaultOutputFormatValue = "markdown" | "docx";
