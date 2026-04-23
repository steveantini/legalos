/**
 * Department metadata — canonical seed set and shared TypeScript shape.
 *
 * Departments are database-driven from Phase 1 onward (see CLAUDE.md and
 * PROJECT_OUTLINE.md): the `departments` table is the runtime source of
 * truth, scoped per-organization and gated by RLS. This file exists to:
 *
 *   1. Seed the initial five departments in a new deployment.
 *   2. Provide a shared TypeScript type (`DepartmentSeed`) used by the
 *      seed script and any one-time tooling.
 *
 * TODO (Phase 1):
 * - Import `departmentSeed` from the Supabase seed script, not from
 *   runtime frontend code.
 * - Do NOT read this file from a React component; the active department
 *   list comes from the database via RLS-scoped queries.
 */

export interface DepartmentSeed {
  /** URL slug (kebab-case, used in /departments/[slug]). */
  slug: string;
  /** Display name. */
  name: string;
  /** Short description shown on the department chooser. */
  description: string;
  /** Sort order in lists; lower first. */
  sortOrder: number;
}

export const departmentSeed: DepartmentSeed[] = [
  {
    slug: "commercial",
    name: "Commercial",
    description: "Contract review, vendor agreements, commercial operations.",
    sortOrder: 1,
  },
  {
    slug: "ma",
    name: "Mergers & Acquisitions",
    description: "Deal diligence, merger agreements, integration planning.",
    sortOrder: 2,
  },
  {
    slug: "public-sector",
    name: "Public Sector",
    description: "Government contracts and public-sector matters.",
    sortOrder: 3,
  },
  {
    slug: "grra",
    name: "Government Relations & Regulatory Affairs",
    description: "Lobbying, regulatory monitoring, policy advocacy.",
    sortOrder: 4,
  },
  {
    slug: "privacy",
    name: "Privacy",
    description:
      "Data privacy, DPAs, regulatory compliance (GDPR, CCPA, etc.).",
    sortOrder: 5,
  },
];
