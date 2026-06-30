import type { Metadata } from "next";

import { ResearchView, type ScopeOption } from "@/components/knowledge/research-view";
import { HelpLink } from "@/components/workspace/help-link";
import { isCurrentUserSuperAdmin, requireAuthUser } from "@/lib/auth/access";
import {
  getEligibleSourceConnections,
  getVisibleCollections,
} from "@/lib/knowledge/collections-data";
import { getResearchDocumentCap } from "@/lib/knowledge/research/engine";
import { listResearchRuns } from "@/lib/knowledge/research/data";

export const metadata: Metadata = {
  title: "Research",
};

/**
 * Knowledge → Research (Knowledge arc Step 2): institutional questions across
 * the user's RLS-visible collections, answered by the deterministic
 * segmented sweep with citations and per-document findings. v1 is
 * collections-only — the copy says so plainly (web and trusted-source
 * blending are future steps, not implied capability).
 *
 * The research server actions perform the long work in bounded segments;
 * this explicit maxDuration keeps each segment's request comfortably inside
 * the platform budget (the chat routes' value).
 */
export const maxDuration = 300;

export default async function ResearchPage() {
  await requireAuthUser();

  const canSetUpFolders = await isCurrentUserSuperAdmin();
  const [collections, cap, runs, connections] = await Promise.all([
    getVisibleCollections(),
    getResearchDocumentCap(),
    listResearchRuns(),
    canSetUpFolders ? getEligibleSourceConnections() : Promise.resolve([]),
  ]);

  const scopeOptions: ScopeOption[] = collections.map((collection) => ({
    id: collection.id,
    name: collection.name,
    description: collection.description,
    provenance: collection.sources.map(
      (source) => source.displayPath,
    ),
    documentCount: collection.presentCount,
    lastSyncedAt: collection.lastSyncedAt,
  }));

  return (
    <main className="flex flex-col gap-9">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="max-w-[22ch] text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
            Research
          </h1>
          <p className="mt-[14px] max-w-[62ch] text-[14.5px] leading-[1.5] text-muted-foreground">
            Choose your folders and ask. legalOS reads each document where it
            lives and gives you an answer backed by citations, so you can see
            exactly what it found in each one. Research is non-deterministic by
            design: it reads and reasons over your documents, weighing and
            interpreting
            rather than just matching, so it is the right tool when a question
            needs judgment, not a precise count.
          </p>
        </div>
        <HelpLink topic="knowledge" className="mt-3" />
      </header>

      <ResearchView
        collections={scopeOptions}
        cap={cap}
        runs={runs}
        canSetUpFolders={canSetUpFolders}
        connections={connections}
      />
    </main>
  );
}
