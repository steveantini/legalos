import { CAPABILITY_GROUPS } from "@/lib/settings/connections-data";

/**
 * Coherence between the connection policy's two array columns (D-076).
 *
 * `connection_policy` stores `allowed_categories` and `allowed_providers` as two
 * independent arrays that can drift into a contradictory "stranded provider"
 * state (a provider allowed while its category is not). The Policy & access
 * editor removes that failure mode by construction: the super-admin edits only
 * categories, and `allowed_providers` is DERIVED from the allowed categories
 * here, server-side, on every save. The provider list is never edited directly
 * and never trusted from the client, so the two arrays cannot drift.
 *
 * Pure functions over the registry (`CAPABILITY_GROUPS`), so both the save
 * action and the page can import them without pulling in server-only code.
 */

/** Every known capability-category id, in registry order. */
export const KNOWN_CATEGORY_IDS: ReadonlyArray<string> = CAPABILITY_GROUPS.map(
  (group) => group.id,
);

/**
 * The providers an allowed set of categories permits. For each allowed category,
 * its available personal providers (status "available"); coming-soon providers
 * and org-example providers are excluded. This matches migration 0044's seed,
 * whose `allowed_providers` were exactly the available personal providers of the
 * allowed categories. Returns a de-duplicated list in registry order.
 */
export function deriveAllowedProviders(
  allowedCategoryIds: ReadonlyArray<string>,
): string[] {
  const allowed = new Set(allowedCategoryIds);
  const providers: string[] = [];
  for (const group of CAPABILITY_GROUPS) {
    if (!allowed.has(group.id)) continue;
    for (const provider of group.providers) {
      if (provider.status === "available" && !providers.includes(provider.id)) {
        providers.push(provider.id);
      }
    }
  }
  return providers;
}
