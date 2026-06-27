"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { prepareCollection } from "@/lib/actions/collections";
import {
  composePreparationBasis,
  type PreparationTally,
} from "@/lib/knowledge/extraction/extract";

/**
 * The client-driven preparation loop, shared by the Collections view and
 * Structured Query's guided-depth setup. Preparation extracts a kind's fields
 * from a folder's documents in bounded segments; the browser loops the segmented
 * server action until done, echoing back the documents it could not read so the
 * run advances past them rather than retrying forever. Lifted out so the two
 * surfaces drive preparation identically. On the 3a per-set foundation, preparing
 * any one folder of a kind prepares the whole set, so the caller passes a single
 * representative folder id.
 *
 * `verb` follows the state: Prepare on the first run, Update afterward. Progress
 * is keyed by collection id, so the caller can show per-folder progress.
 */
export type PrepProgress = Record<
  string,
  { prepared: number; total: number; verb: "Prepare" | "Update" }
>;

export function usePrepareLoop() {
  const router = useRouter();
  const [prepProgress, setPrepProgress] = useState<PrepProgress>({});

  async function runPrepare(collectionId: string, verb: "Prepare" | "Update") {
    if (prepProgress[collectionId]) return;
    setPrepProgress((prev) => ({
      ...prev,
      [collectionId]: { prepared: 0, total: 0, verb },
    }));
    let failedDocumentIds: string[] | null = null;
    let total = 0;
    const acc: PreparationTally = {
      documentsPrepared: 0,
      documentsUnreadable: 0,
      attributesFound: 0,
      attributesNotFound: 0,
      attributesUnverified: 0,
      attributesReadIncomplete: 0,
    };
    // A generous backstop (segments of 4 documents each), matching runSync.
    const MAX_SEGMENTS = 400;
    try {
      for (let segment = 0; segment < MAX_SEGMENTS; segment += 1) {
        const result = await prepareCollection({ collectionId, failedDocumentIds });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        if (segment === 0) total = result.documentsStale;
        acc.documentsPrepared += result.tally.documentsPrepared;
        acc.documentsUnreadable += result.tally.documentsUnreadable;
        acc.attributesFound += result.tally.attributesFound;
        acc.attributesNotFound += result.tally.attributesNotFound;
        acc.attributesUnverified += result.tally.attributesUnverified;
        acc.attributesReadIncomplete += result.tally.attributesReadIncomplete;
        failedDocumentIds = result.failedDocumentIds;
        setPrepProgress((prev) => ({
          ...prev,
          [collectionId]: {
            prepared: acc.documentsPrepared + acc.documentsUnreadable,
            total,
            verb,
          },
        }));
        if (result.completed) {
          toast.success(
            total === 0
              ? "Already up to date."
              : composePreparationBasis(acc, total),
          );
          router.refresh();
          return;
        }
      }
      toast.error(
        "Preparation is taking unusually long and paused for now. Run Update to continue.",
      );
      router.refresh();
    } finally {
      setPrepProgress((prev) => {
        const next = { ...prev };
        delete next[collectionId];
        return next;
      });
    }
  }

  return { prepProgress, runPrepare };
}
