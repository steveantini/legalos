"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { SchemaBuilderDialog, type SchemaBuilderSubmit } from "@/components/knowledge/schema-builder-dialog";
import { usePrepareLoop } from "@/components/knowledge/use-prepare-loop";
import { Button } from "@/components/ui/button";
import {
  createDocumentKind,
  listDocumentKinds,
  pointFoldersAtKind,
} from "@/lib/actions/structured-query";
import type { KindGroup } from "@/lib/knowledge/document-kinds";
import type { DocumentKindSummary } from "@/lib/knowledge/structured-query-shared";

/**
 * Structured Query guided depth (Step 3b), super-admin only. When the picked
 * folders resolve to a kind that isn't askable yet, this is the reuse-led path to
 * make it so, in the order that does the least work:
 *  - NOT SET UP → reuse an existing document kind (one click), or define a new
 *    one (the shared schema builder).
 *  - SET UP, NOT PREPARED → prepare it (the shared client-driven loop), with
 *    "edit fields" reachable for a correction.
 * Members never see this; they get an honest "an administrator can set this up"
 * line from the view. Reuses the schema builder and the prepare loop rather than
 * rebuilding either, so Collections and Structured Query set kinds up identically.
 */
export function StructuredQueryGuidedDepth({ group }: { group: KindGroup }) {
  const router = useRouter();
  const { prepProgress, runPrepare } = usePrepareLoop();
  const [dialog, setDialog] = useState<null | "define">(null);
  const [reuseOpen, setReuseOpen] = useState(false);
  const [kinds, setKinds] = useState<DocumentKindSummary[] | null>(null);
  const [pending, start] = useTransition();

  const representativeId = group.folderIds[0];
  const prep = prepProgress[representativeId] ?? null;
  const folderCount = group.folderIds.length;
  const folderNoun = folderCount === 1 ? "folder" : "folders";

  function openReuse() {
    setReuseOpen(true);
    if (kinds === null) {
      void (async () => setKinds(await listDocumentKinds()))();
    }
  }

  function handlePoint(schemaId: string) {
    if (pending) return;
    start(async () => {
      const result = await pointFoldersAtKind({
        collectionIds: group.folderIds,
        schemaId,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Linked to the document kind. Prepare it to start asking.");
      setReuseOpen(false);
      router.refresh();
    });
  }

  function handleDefine(input: SchemaBuilderSubmit) {
    if (pending || !input.name) return;
    const name = input.name;
    start(async () => {
      const result = await createDocumentKind({
        name,
        attributes: input.attributes,
        collectionIds: group.folderIds,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Document kind created. Prepare it to start asking.");
      setDialog(null);
      router.refresh();
    });
  }

  // SET UP, NOT PREPARED — the only thing left is to prepare (extract) the kind.
  if (group.hasSchema) {
    return (
      <div className="max-w-[75ch] rounded-xl border border-hairline bg-paper-2 p-5">
        <p className="text-[14.5px] leading-[1.55] text-foreground">
          <span className="font-medium">{group.schemaName}</span> is set up across{" "}
          {folderCount} {folderNoun}. Prepare it to extract the fields, then you can
          ask exact questions.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <Button
            type="button"
            onClick={() => runPrepare(representativeId, "Prepare")}
            disabled={prep !== null}
          >
            {prep
              ? prep.total > 0
                ? `Preparing… ${prep.prepared}/${prep.total}`
                : "Preparing…"
              : "Prepare"}
          </Button>
        </div>
      </div>
    );
  }

  // NOT SET UP — reuse an existing kind, or define a new one.
  return (
    <div className="max-w-[75ch] rounded-xl border border-hairline bg-paper-2 p-5">
      <p className="text-[14.5px] leading-[1.55] text-foreground">
        {folderCount === 1 ? "This folder isn't" : "These folders aren't"} set up to
        query yet. Reuse a document kind they match, or define a new one to describe
        the fields you want to track.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={openReuse} disabled={pending}>
          Use an existing document kind
        </Button>
        <Button type="button" size="sm" onClick={() => setDialog("define")} disabled={pending}>
          Define a new document kind
        </Button>
      </div>

      {reuseOpen ? (
        <div className="mt-4 flex flex-col gap-2">
          {kinds === null ? (
            <p className="text-[12.5px] text-caption">Loading document kinds…</p>
          ) : kinds.length === 0 ? (
            <p className="text-[12.5px] text-caption">
              No document kinds defined yet. Define a new one above.
            </p>
          ) : (
            kinds.map((kind) => (
              <button
                key={kind.schemaId}
                type="button"
                onClick={() => handlePoint(kind.schemaId)}
                disabled={pending}
                className="rounded-lg border border-hairline bg-background px-4 py-3 text-left transition-colors duration-hover ease-soft hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60 motion-reduce:transition-none"
              >
                <span className="block text-[13.5px] font-medium text-foreground">
                  {kind.schemaName}
                </span>
                <span className="mt-0.5 block text-[11.5px] text-caption">
                  {kind.fieldLabels.slice(0, 6).join(", ")}
                  {kind.fieldLabels.length > 6 ? ", …" : ""} · {kind.folderCount}{" "}
                  {kind.folderCount === 1 ? "folder" : "folders"}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}

      {dialog === "define" ? (
        <SchemaBuilderDialog
          title="Define a new document kind"
          description="Describe what these folders hold and the fields to track. Nothing is extracted yet; this saves the definition, then you prepare it."
          initialAttributes={[]}
          requireName
          saveLabel="Create kind"
          pending={pending}
          onClose={() => setDialog(null)}
          onSubmit={handleDefine}
        />
      ) : null}
    </div>
  );
}
