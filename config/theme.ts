/**
 * Theme preset registry.
 *
 * Actual CSS variable definitions live in `app/globals.css` (Tailwind v4
 * `@theme` directive plus `:root[data-theme="<preset>"]` selectors — see
 * DECISION_LOG.md D-014). This file only defines the preset names and
 * their TypeScript-visible metadata, consumed by the theme switcher UI.
 *
 * TODO (Phase 0 end / Phase 1):
 * - Port Carbon / Modern / Minimal CSS tokens from the prior
 *   `agent-launchpad-template` into `app/globals.css` under the matching
 *   `:root[data-theme="<preset>"]` selectors.
 * - Wire a theme toggle (likely in the admin settings area) that writes
 *   `document.documentElement.dataset.theme = preset`.
 * - Consider `next-themes` for SSR-safe preset persistence if/when a
 *   user-facing toggle is added.
 */

import type { ThemePreset } from "./site";

export interface ThemePresetMeta {
  /** Preset id used as the value of `data-theme` on <html>. */
  id: ThemePreset;
  /** Display name shown in a theme picker. */
  name: string;
  /** Preview swatch color (hex, for picker UI only — runtime uses CSS vars). */
  previewColor: string;
  /** One-line description for the picker. */
  description: string;
}

export const themePresets: Record<ThemePreset, ThemePresetMeta> = {
  carbon: {
    id: "carbon",
    name: "Carbon",
    previewColor: "#0f62fe",
    description: "IBM-inspired enterprise blue.",
  },
  modern: {
    id: "modern",
    name: "Modern",
    previewColor: "#6366f1",
    description: "Contemporary indigo.",
  },
  minimal: {
    id: "minimal",
    name: "Minimal",
    previewColor: "#18181b",
    description: "Monochrome, restrained.",
  },
  custom: {
    id: "custom",
    name: "Custom",
    previewColor: "#000000",
    description: "Override tokens directly in app/globals.css.",
  },
};
