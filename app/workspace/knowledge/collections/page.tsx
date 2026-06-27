import type { Metadata } from "next";

import { CollectionsView } from "@/components/knowledge/collections-view";
import { HelpLink } from "@/components/workspace/help-link";
import { isCurrentUserSuperAdmin, requireAuthUser } from "@/lib/auth/access";
import {
  getEligibleSourceConnections,
  getOrgDepartmentsForPicker,
  getVisibleCollections,
} from "@/lib/knowledge/collections-data";

export const metadata: Metadata = {
  title: "Collections",
};

/**
 * Knowledge → Collections (Knowledge arc Step 1): the named, governed scopes
 * an administrator draws over the repositories the team already uses. Every
 * collection shows its real sources transparently ("Google Drive / Legal /
 * Playbooks"); the only thing legalOS stores is a document inventory
 * (titles and metadata, captured by an admin-clicked sync) — content stays
 * in the repository.
 *
 * Visibility is the DATABASE's answer: the page renders whatever the
 * RLS-scoped read returns (org-wide collections, plus department-scoped ones
 * the viewer belongs to). Super admins get the management surface; everyone
 * else gets the same cards read-only.
 */
export default async function CollectionsPage({
  searchParams,
}: {
  // `?schema=<collectionId>` deep-links from the Structured Query empty state
  // straight to defining a schema on that collection (admins only).
  searchParams: Promise<{ schema?: string }>;
}) {
  await requireAuthUser();
  const isSuperAdmin = await isCurrentUserSuperAdmin();
  const { schema } = await searchParams;

  const [collections, departments, eligibleConnections] = await Promise.all([
    getVisibleCollections(),
    isSuperAdmin ? getOrgDepartmentsForPicker() : Promise.resolve([]),
    isSuperAdmin ? getEligibleSourceConnections() : Promise.resolve([]),
  ]);

  return (
    <main className="flex flex-col gap-9">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="max-w-[22ch] text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
            Collections
          </h1>
          <p className="mt-[14px] max-w-[60ch] text-[14.5px] leading-[1.5] text-muted-foreground">
            The folders from your connected drives that your team can ask over.
            Each shows exactly where its documents live; legalOS keeps an
            inventory, never the documents themselves.
          </p>
        </div>
        {/* Admins get the managing guide; everyone else the user-facing one. */}
        <HelpLink topic={isSuperAdmin ? "collections" : "knowledge"} className="mt-3" />
      </header>

      <CollectionsView
        collections={collections}
        departments={departments}
        eligibleConnections={eligibleConnections}
        canEdit={isSuperAdmin}
        initialSchemaCollectionId={isSuperAdmin ? schema : undefined}
      />
    </main>
  );
}
