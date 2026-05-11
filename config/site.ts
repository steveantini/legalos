/**
 * Site-wide configuration: branding, company name, active theme preset,
 * admin contact.
 */

export type ThemePreset = "carbon" | "modern" | "minimal" | "custom";

export interface SiteConfig {
  /** Displayed company name (e.g., "Acme Corp., Inc."). */
  companyName: string;
  /** App title used in <title> and top-bar branding. */
  siteTitle: string;
  /** Name shown on the department chooser and in copy ("Legal", etc.). */
  departmentName: string;
  /** Active theme preset. Currently only `carbon` is wired in `app/globals.css`. */
  themePreset: ThemePreset;
  /** Email shown on support/help pages and in error fallback UI. */
  adminEmail: string;
}

export const siteConfig: SiteConfig = {
  companyName: "Your Company, Inc.",
  siteTitle: "legalOS",
  departmentName: "Legal",
  themePreset: "carbon",
  adminEmail: "steven@legalos.io",
};

/**
 * Productivity Gains Calculator constants. Surfaced on
 * `/admin/calculator`. Adjust the platform cost to match your vendor
 * pricing; the calculator multiplies it by the number of team members
 * to derive the displayed annual cost. `costLabel` and
 * `costDescription` flow through to the calculator's info modal.
 */
export interface CalculatorConfig {
  costPerUserPerYear: number;
  costLabel: string;
  costDescription: string;
}

export const calculatorConfig: CalculatorConfig = {
  costPerUserPerYear: 500,
  costLabel: "Platform Annual Cost",
  costDescription:
    "Estimated annual AI platform cost per user. Adjust this value in config/site.ts to match your vendor pricing.",
};
