"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AnswerBlock,
  FindingsTable,
  statusLabel,
} from "@/components/knowledge/research-pieces";
import {
  advanceResearchRunAction,
  cancelResearchRun,
} from "@/lib/actions/research";
import {
  classifyResearchFailure,
  RESEARCH_DOC_CAP_WHY,
  RESEARCH_ENUMERATION_WHY,
  type ResearchCitation,
  type ResearchFindingView,
  type ResearchRunStatus,
} from "@/lib/knowledge/research/shared";

/**
 * The live run view: drives the segmented engine with the client loop idiom
 * (the collection sync's shape) — one advance per round trip, progress and
 * PARTIAL FINDINGS rendering as they accumulate, cancel honored between
 * segments. Also hosts reopened non-terminal runs (the resume path): the
 * loop continues exactly where the cursor left off.
 *
 * The loop lives in an effect keyed by a monotonically increasing "drive"
 * counter started from event handlers; every setState happens after an
 * await, so nothing is set synchronously from the effect.
 */

export type LiveRunInitial = {
  runId: string;
  status: ResearchRunStatus;
  documentsTotal: number;
  documentsProcessed: number;
  documentsFailed: number;
  skippedUnsupported: number;
  answer: string | null;
  citations: ResearchCitation[];
  basis: string | null;
  failureReason: string | null;
};

const TERMINAL: ResearchRunStatus[] = ["completed", "failed", "cancelled"];
/** Loop backstop far above any capped run (segments of 12 over cap 1000). */
const MAX_ADVANCES = 600;

export function ResearchRunLive({
  initial,
  initialFindings,
  autoStart,
  canDrive = true,
}: {
  initial: LiveRunInitial;
  initialFindings: ResearchFindingView[];
  autoStart: boolean;
  /** False for a viewer who isn't the asker: no resume/cancel controls. */
  canDrive?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ResearchRunStatus>(initial.status);
  const [total, setTotal] = useState(initial.documentsTotal);
  const [processed, setProcessed] = useState(initial.documentsProcessed);
  const [failed, setFailed] = useState(initial.documentsFailed);
  const [skipped, setSkipped] = useState(initial.skippedUnsupported);
  const [findings, setFindings] = useState<ResearchFindingView[]>(initialFindings);
  const [answer, setAnswer] = useState(initial.answer);
  const [citations, setCitations] = useState(initial.citations);
  const [basis, setBasis] = useState(initial.basis);
  const [failureReason, setFailureReason] = useState(initial.failureReason);
  const [driving, setDriving] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const stopRef = useRef(false);

  const terminal = TERMINAL.includes(status);

  async function drive() {
    if (driving || terminal) return;
    setDriving(true);
    stopRef.current = false;
    try {
      for (let i = 0; i < MAX_ADVANCES; i += 1) {
        if (stopRef.current) return;
        const response = await advanceResearchRunAction(initial.runId);
        if (!response.ok) {
          toast.error(response.error);
          return;
        }
        const r = response.result;
        setStatus(r.status);
        setTotal(r.documentsTotal);
        setProcessed(r.documentsProcessed);
        setFailed(r.documentsFailed);
        setSkipped(r.skippedUnsupported);
        if (r.newFindings.length > 0) {
          setFindings((prev) => {
            const seen = new Set(prev.map((f) => f.externalId));
            return [
              ...prev,
              ...r.newFindings.filter((f) => !seen.has(f.externalId)),
            ];
          });
        }
        if (r.answer) setAnswer(r.answer);
        setCitations(r.citations);
        if (r.basis) setBasis(r.basis);
        setFailureReason(r.failureReason);
        if (TERMINAL.includes(r.status)) {
          router.refresh();
          return;
        }
      }
      toast.error("This run is unusually long and paused. Advance it again to resume.");
    } finally {
      setDriving(false);
    }
  }

  // Kick off once on mount when asked (a freshly started run, or a reopened
  // resumable run the owner chose to continue). The drive function awaits
  // before any setState, so the effect sets nothing synchronously.
  const kickedRef = useRef(false);
  useEffect(() => {
    if (!autoStart || kickedRef.current) return;
    kickedRef.current = true;
    void drive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  async function handleCancel() {
    if (cancelRequested) return;
    setCancelRequested(true);
    stopRef.current = true;
    const result = await cancelResearchRun(initial.runId);
    if (!result.ok) {
      toast.error(result.error);
      setCancelRequested(false);
      return;
    }
    setStatus("cancelled");
    toast.success("Run cancelled. Partial findings are kept.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* The status line: progress while working, the outcome when done. */}
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[13.5px] font-medium text-foreground" role="status">
          {status === "running" && total > 0
            ? `${statusLabel(status)}… ${Math.min(processed, total)} of ${total}`
            : `${statusLabel(status)}${terminal ? "" : "…"}`}
        </p>
        {!terminal && canDrive ? (
          <>
            {!driving ? (
              <Button type="button" variant="outline" size="sm" onClick={() => void drive()}>
                Resume
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => void handleCancel()}
              disabled={cancelRequested}
            >
              {cancelRequested ? "Cancelling…" : "Cancel run"}
            </Button>
          </>
        ) : null}
      </div>

      {status === "failed" && failureReason ? (
        <div
          role="alert"
          className="max-w-[70ch] rounded-lg border border-warn-fg/30 bg-paper-2 px-4 py-3"
        >
          <p className="text-[13px] leading-[1.5] text-warn-fg">
            {failureReason}
          </p>
          {/* The matching "why", chosen by the failure's KIND so the two
              distinct limits (admin document cap vs. fixed enumeration
              budget) never get the wrong explanation. */}
          {(() => {
            const kind = classifyResearchFailure(failureReason);
            if (kind === "other") return null;
            const why =
              kind === "doc_cap"
                ? RESEARCH_DOC_CAP_WHY
                : RESEARCH_ENUMERATION_WHY;
            return (
              <details className="group mt-2">
                <summary className="cursor-pointer list-none text-[12px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  Why?
                </summary>
                <p className="mt-1.5 text-[12px] leading-[1.5] text-caption">
                  {why}
                </p>
              </details>
            );
          })()}
        </div>
      ) : null}

      {status === "cancelled" ? (
        <p className="max-w-[70ch] text-[13px] leading-[1.5] text-muted-foreground">
          This run was cancelled. The findings below are what it read before
          stopping.
        </p>
      ) : null}

      {answer ? (
        <AnswerBlock answer={answer} basis={basis} citations={citations} />
      ) : null}

      {findings.length > 0 ? (
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Per-document findings
            {failed > 0 ? ` · ${failed} could not be read` : ""}
            {skipped > 0 ? ` · ${skipped} unsupported ${skipped === 1 ? "type" : "types"} skipped` : ""}
          </p>
          <FindingsTable findings={findings} />
        </div>
      ) : null}
    </div>
  );
}
