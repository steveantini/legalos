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
 * Shape stored under `deptCollapsedSectionsKey(...)`. Each section flag
 * is independent so the user can collapse one section without
 * touching the others' state.
 */
export interface CollapsedSectionsValue {
  departmentAgents?: boolean;
  externalAgents?: boolean;
  myAgents?: boolean;
}

// Future keys will live alongside the above. Sketches (not in use yet):
//
//   export const AGENT_DEFAULT_MODEL_KEY = "agent:default_model";
//   export type AgentDefaultModelValue = string; // a model id
//
//   export const AGENT_DEFAULT_OUTPUT_FORMAT_KEY = "agent:default_output_format";
//   export type AgentDefaultOutputFormatValue = "markdown" | "docx";
