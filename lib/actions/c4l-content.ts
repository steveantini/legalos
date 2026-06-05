"use server";

import {
  isCurrentUserPlatformOwner,
  requireAuthUser,
} from "@/lib/auth/access";
import { recordVendorContentRefreshed } from "@/lib/content/content-settings";
import { fetchC4LSkills, type C4LRefreshResult } from "@/lib/content/c4l-fetch";
import { importC4LContent } from "@/lib/content/c4l-import";
import {
  createC4LImportStore,
  resolveContentOrganizationId,
} from "@/lib/content/c4l-store";
import { CLAUDE_FOR_LEGAL } from "@/lib/content/vendor-registry";

/**
 * Refresh the curated Claude for Legal content from its public source repo
 * (C4L/platform arc, Step 3). PLATFORM-OWNER ONLY: an org super_admin cannot run
 * this. It fetches + parses the mapped plugins' skills at runtime (Part 1), feeds
 * them to the safe insert-new-only `importC4LContent` (Step 2), and returns a
 * report. It NEVER applies content drift or imports unmapped plugins — those are
 * surfaced for a platform-owner decision (Steps 4-5), never made silently.
 *
 * The page is already gated by `requirePlatformOwner()` in the platform layout;
 * the explicit check here is defense in depth and returns a clean typed error
 * (rather than a thrown 404) so the button can render it calmly.
 */
export async function refreshC4LContent(): Promise<C4LRefreshResult> {
  await requireAuthUser();
  if (!(await isCurrentUserPlatformOwner())) {
    return { ok: false, error: "You don't have permission to do that." };
  }

  const organizationId = await resolveContentOrganizationId();
  if (!organizationId) {
    return { ok: false, error: "No organization was found to import content into." };
  }

  const fetched = await fetchC4LSkills(CLAUDE_FOR_LEGAL);
  if (!fetched.ok) {
    return { ok: false, error: fetched.error };
  }

  let result;
  try {
    result = await importC4LContent({
      skills: fetched.skills,
      provider: CLAUDE_FOR_LEGAL,
      organizationId,
      store: createC4LImportStore(),
    });
  } catch (err) {
    console.error("C4L import failed", err);
    return {
      ok: false,
      error: "The content couldn't be saved. No changes were made; please try again.",
    };
  }

  // Record the successful refresh time for the passive "last updated" line super
  // admins see in Policy & access (Step 5). Best-effort; never fails the refresh.
  await recordVendorContentRefreshed(organizationId, CLAUDE_FOR_LEGAL.providerId);

  const mapping = CLAUDE_FOR_LEGAL.pluginDepartmentMap;

  // Upstream first-party plugins we don't map — the authoritative
  // uncategorized-content report (repo minus mapping), surfaced not imported.
  const unmappedPlugins = fetched.repoPlugins.filter(
    (plugin) => !(plugin in mapping),
  );

  // Departments that received new agents (for a friendly "added to ..." line).
  const insertedDepartments = [
    ...new Set(
      result.inserts
        .map((row) => pluginFromSourceOrigin(row.sourceOrigin))
        .map((plugin) => (plugin ? mapping[plugin] : undefined))
        .filter((slug): slug is string => Boolean(slug)),
    ),
  ].sort();

  return {
    ok: true,
    summary: {
      insertedCount: result.insertedCount,
      insertedDepartments,
      skippedFilteredCount: result.skippedFiltered.length,
      unmappedPlugins,
      updatesAvailableCount: result.updatesAvailable.length,
      unchangedCount: result.unchangedCount,
    },
  };
}

/** Pull the plugin slug out of a "claude-for-legal:<plugin>/<skill>" origin. */
function pluginFromSourceOrigin(sourceOrigin: string): string | null {
  const afterColon = sourceOrigin.split(":")[1];
  if (!afterColon) return null;
  return afterColon.split("/")[0] || null;
}
