import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AdoptWatcherForm,
  type AdoptableCollection,
} from "@/components/workflows/adopt-watcher-form";
import { HelpLink } from "@/components/workspace/help-link";
import { isCurrentUserOrgAdmin, requireAuthUser } from "@/lib/auth/access";
import { getVisibleCollections } from "@/lib/knowledge/collections-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isWatcherTemplateSlug } from "@/lib/workflows/watchers-shared";

export const metadata: Metadata = {
  title: "Adopt a watcher",
};

/**
 * Adopt a watcher template (Stage 3a, D-224): the one deliberate step that
 * creates the active watcher and the schedule that runs it. Org-admin gated
 * like every authoring surface (a member never reaches this page; the card
 * shows them the honest line instead). Eligible collections are the ones whose
 * document kind tracks an expiration date — the field the renewal scan reads
 * (its default expiry key) — so the picker can't offer a collection the
 * watcher would scan to zero findings forever.
 */
export default async function AdoptWatcherPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  await requireAuthUser();
  if (!(await isCurrentUserOrgAdmin())) notFound();

  const { templateId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("workflow_definitions")
    .select("id, name, description, template_slug")
    .eq("id", templateId)
    .eq("status", "template")
    .maybeSingle();
  if (!data || !isWatcherTemplateSlug(data.template_slug as string | null)) {
    notFound();
  }

  const collections = await getVisibleCollections();
  const eligible: AdoptableCollection[] = collections
    .filter((c) =>
      c.schemaAttributes.some(
        (a) => a.key === "expiration_date" && a.type === "date",
      ),
    )
    .map((c) => ({ id: c.id, name: c.name }));

  return (
    <main className="flex w-full max-w-3xl flex-col gap-9">
      <header>
        <div className="flex items-center justify-between gap-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-caption">
            Adopt a watcher
          </p>
          <HelpLink topic="workflows" />
        </div>
        <h1 className="mt-2 text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          {data.name as string}
        </h1>
        <p className="mt-[14px] max-w-[56ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          {(data.description as string | null) ||
            "A watcher runs on a schedule and records what it finds."}
        </p>
      </header>

      {eligible.length > 0 ? (
        <section className="flex flex-col gap-4" aria-label="Configure the watcher">
          <h2 className="text-[17px] font-medium tracking-[-0.012em] text-foreground">
            Configure it
          </h2>
          <AdoptWatcherForm templateId={data.id as string} collections={eligible} />
        </section>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-[14px] border border-dashed border-border bg-card/50 px-6 py-10 text-center">
          <p className="text-[15px] font-medium text-foreground">
            No collection tracks an expiration date yet
          </p>
          <p className="max-w-[46ch] text-[13.5px] leading-[1.5] text-muted-foreground">
            The renewal watcher reads a collection&rsquo;s prepared values, so it
            needs a document kind with an &ldquo;Expiration date&rdquo; date
            field, prepared at least once. Set one up in Knowledge, then come
            back.
          </p>
          <Link
            href="/workspace/knowledge/collections"
            className="text-[13px] font-medium text-foreground underline underline-offset-4"
          >
            Go to Collections
          </Link>
        </div>
      )}
    </main>
  );
}
