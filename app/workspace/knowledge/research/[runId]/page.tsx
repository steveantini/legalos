import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ResearchRunActions } from "@/components/knowledge/research-run-actions";
import { ResearchRunLive } from "@/components/knowledge/research-run-live";
import { HelpLink } from "@/components/workspace/help-link";
import { getCurrentUserProfile, requireAuthUser } from "@/lib/auth/access";
import { getResearchRunDetail } from "@/lib/knowledge/research/data";

export const metadata: Metadata = {
  title: "Research run",
};

/** Segment budget for resumed runs (matches the main Research page). */
export const maxDuration = 300;

/**
 * A reopened research run (Knowledge arc Step 2). RLS decides visibility
 * (the asker, plus org/super admins reading the organization's work); an
 * invisible run is a 404, not a redirect. A non-terminal run reopened by its
 * OWNER is resumable — the live runner continues from the persisted cursor;
 * everyone else sees the honest current state read-only.
 */
export default async function ResearchRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const user = await requireAuthUser();
  const { runId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(runId)) notFound();

  const detail = await getResearchRunDetail(runId);
  if (!detail) notFound();
  const { run, findings } = detail;
  const isOwner = run.ownerUserId === user.id;
  const profile = await getCurrentUserProfile();
  const isAdmin =
    profile?.role === "super_admin" || profile?.role === "org_admin";
  const terminal =
    run.status === "completed" ||
    run.status === "failed" ||
    run.status === "cancelled";

  return (
    <main className="flex flex-col gap-7">
      <header>
        <div className="flex items-center justify-between gap-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Research run
          </p>
          <div className="flex items-center gap-3">
            <HelpLink topic="knowledge" />
            {/* The chat export idiom, one kebab: export + delete. */}
            <ResearchRunActions
              runId={run.id}
              terminal={terminal}
              canDelete={isOwner || isAdmin}
            />
          </div>
        </div>
        <h1 className="mt-1 max-w-[36ch] text-[28px] font-normal leading-[1.15] tracking-[-0.02em] text-foreground">
          {run.question}
        </h1>
        <p className="mt-2 text-[13px] leading-[1.5] text-muted-foreground">
          Scoped to {run.scope.map((c) => c.name).join(", ")}.
        </p>
        {/* The transparency rule: the scope's real sources. */}
        {run.scope.flatMap((c) => c.provenance).map((path) => (
          <p
            key={path}
            className="mt-0.5 break-all font-mono text-[11.5px] text-caption"
          >
            {path}
          </p>
        ))}
        {!terminal && !isOwner ? (
          <p className="mt-3 max-w-[60ch] text-[13px] leading-[1.5] text-muted-foreground">
            This run is still in progress; only the person who started it can
            advance or cancel it.
          </p>
        ) : null}
      </header>

      <ResearchRunLive
        initial={{
          runId: run.id,
          status: run.status,
          documentsTotal: run.documentsTotal,
          documentsProcessed: run.documentsProcessed,
          documentsFailed: run.documentsFailed,
          skippedUnsupported: run.skippedUnsupported,
          answer: run.answer,
          citations: run.citations,
          basis: run.basis,
          failureReason: run.failureReason,
        }}
        initialFindings={findings}
        autoStart={false}
        canDrive={isOwner}
      />
    </main>
  );
}
