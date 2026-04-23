/**
 * Site-wide configuration: branding, company name, active theme preset,
 * admin contact.
 *
 * TODO (Phase 0 end / Phase 1):
 * - Wire `siteConfig` into the root layout (<title>, metadata, top-bar branding).
 * - Pass `themePreset` into the theme switcher (see config/theme.ts).
 * - Replace placeholder values before first real deploy.
 */

export type ThemePreset = "carbon" | "modern" | "minimal" | "custom";

export interface SiteConfig {
  /** Displayed company name (e.g., "Acme Corp., Inc."). */
  companyName: string;
  /** App title used in <title> and top-bar branding. */
  siteTitle: string;
  /** Name shown on the department chooser and in copy ("Legal", etc.). */
  departmentName: string;
  /** Active theme preset. See config/theme.ts for preset metadata. */
  themePreset: ThemePreset;
  /** Email shown on support/help pages and in error fallback UI. */
  adminEmail: string;
}

export const siteConfig: SiteConfig = {
  companyName: "Your Company, Inc.",
  siteTitle: "Legal AI Launchpad",
  departmentName: "Legal",
  themePreset: "carbon",
  adminEmail: "legal-ops@example.com",
};
