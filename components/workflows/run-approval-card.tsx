"use client";

import { ShieldQuestionIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { decideWorkflowApproval } from "@/lib/actions/workflows";

/** A pending write summarized PII-safely: friendly label + argument key NAMES only. */
type PendingWriteDisplay = {
  /** Full friendly label, e.g. "Google Drive: create file". */
  full: string;
  /** The server portion ("Google Drive"), or null for a bare tool. */
  server: string | null;
  /** The action portion ("create file"). */
  action: string;
  /** Sorted argument key names. Never values, file names, or secrets. */
  argKeys: string[];
};

interface RunApprovalCardProps {
  pendingApprovalId: string;
  kind: "checkpoint" | "write" | "agent_write";
  /** The checkpoint's prompt to the approver (kind 'checkpoint'). */
  prompt: string | null;
  /** The pending write's PII-safe summary (kind 'write' | 'agent_write'). */
  write: PendingWriteDisplay | null;
  /** True for the run's owner — the only authorized approver. Admins watch read-only. */
  canDecide: boolean;
}

/**
 * Human-in-the-loop approval for a paused workflow run (Workflows arc, Step
 * 4b) — the run-surface sibling of the chat ConfirmationCard, in the same calm
 * register. The run is paused at a human checkpoint or before a write action;
 * nothing happens until the owner approves or denies, via
 * decideWorkflowApproval (whose atomic claim guarantees at-most-once). For a
 * write, only argument KEY NAMES are ever shown, never values — the same PII
 * bar the chat confirmation holds.
 *
 * If the decision was already recorded elsewhere (another tab, a double
 * click), the action returns already_decided and the card settles calmly into
 * a resolved note while the page refreshes — no double-fire, no alarm.
 */
export function RunApprovalCard({
  pendingApprovalId,
  kind,
  prompt,
  write,
  canDecide,
}: RunApprovalCardProps) {
  const router = useRouter();
  const [deciding, setDeciding] = useState<"approve" | "deny" | null>(null);
  const [settledNote, setSettledNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approve" | "deny") {
    if (deciding) return;
    setError(null);
    setDeciding(decision);
    const res = await decideWorkflowApproval(pendingApprovalId, decision);
    if (res.ok) {
      // Keep the buttons settled; the refreshed page replaces this card with
      // the run's new state (the executed step, or the cancelled run).
      router.refresh();
      return;
    }
    if (res.error === "already_decided") {
      setSettledNote("This was already decided, so nothing ran twice. Updating the run…");
      router.refresh();
      return;
    }
    setError("The decision couldn’t be recorded. Try again.");
    setDeciding(null);
  }

  // The action sentence for a write: "create file on Google Drive".
  const actionSentence = write
    ? write.server
      ? `${write.action} on ${write.server}`
      : write.action
    : null;

  return (
    <div className="overflow-hidden rounded-lg border border-primary/25 bg-chat-cite-bg">
      <div className="flex items-start gap-3 px-4 py-3.5">
        <ShieldQuestionIcon
          aria-hidden
          strokeWidth={1.5}
          className="mt-px size-4 shrink-0 text-primary"
        />
        <div className="min-w-0 flex-1">
          {kind === "checkpoint" ? (
            <>
              <p className="text-[13.5px] leading-[1.5] text-foreground">
                This run is paused at a human checkpoint. Approve to continue the
                run, or deny to stop it here.
              </p>
              {prompt ? (
                <p className="mt-2 border-l-2 border-primary/30 pl-3 text-[13.5px] leading-[1.5] text-foreground/90">
                  {prompt}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-[13.5px] leading-[1.5] text-foreground">
                {kind === "agent_write" ? (
                  // An agent-PROPOSED write: denying lets the agent finish
                  // without acting and the run carries on (unlike an
                  // explicitly-authored action, whose deny stops the run).
                  <>
                    The agent in this step wants to {actionSentence}. Approving
                    performs this action on the connected system and lets the
                    agent continue; denying lets the agent finish without acting,
                    and the run carries on.
                  </>
                ) : (
                  <>
                    This run wants to {actionSentence}. Approving performs this
                    action on the connected system; denying stops the run with
                    nothing done.
                  </>
                )}
              </p>
              {write ? (
                <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.05em] text-caption">
                  {write.argKeys.length > 0
                    ? `${write.full} · ${write.argKeys.join(", ")}`
                    : write.full}
                </p>
              ) : null}
            </>
          )}

          {settledNote ? (
            <p className="mt-3 text-[13px] leading-[1.5] text-muted-foreground">
              {settledNote}
            </p>
          ) : canDecide ? (
            <div className="mt-3 flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => decide("approve")}
                disabled={deciding !== null}
              >
                {deciding === "approve" ? "Approving…" : "Approve"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => decide("deny")}
                disabled={deciding !== null}
              >
                {deciding === "deny" ? "Denying…" : "Deny"}
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              Only the person who started this run can approve or deny it.
            </p>
          )}

          {error ? (
            <p role="alert" className="mt-2 text-[12.5px] text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
