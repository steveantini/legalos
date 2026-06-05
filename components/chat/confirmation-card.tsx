"use client";

import { ShieldQuestionIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { ChatToolCall } from "@/lib/chat/sse-parser";
import type { ConfirmationDecision } from "@/lib/chat/mcp-confirmation";
import { toolLabel } from "@/lib/chat/tool-display";

interface ConfirmationCardProps {
  /**
   * The paused write tool call. Its status drives the card:
   *   - awaiting_confirmation → Approve / Deny buttons
   *   - denied                → settled "you declined" state
   *   - approved              → settled "approved" state (executes in 2P-7b-ii)
   */
  call: ChatToolCall;
  /**
   * Fires when the user decides. Omitted (buttons hidden) when no decision can
   * be made here — e.g. an org admin viewing another user's conversation, or a
   * call with no wired paused run. The owner's chat surface passes it through.
   */
  onDecision?: (decision: ConfirmationDecision) => void;
}

/** PII-safe argument key names, read defensively from the trace's input summary. */
function readArgKeys(input: unknown): string[] {
  if (input && typeof input === "object" && "argKeys" in input) {
    const keys = (input as { argKeys?: unknown }).argKeys;
    if (Array.isArray(keys) && keys.every((k) => typeof k === "string")) {
      return keys as string[];
    }
  }
  return [];
}

/**
 * Human-in-the-loop confirmation for an MCP write (2P-7b). Calm and clear, in
 * the same understated register as the tool-trace card: the agent wants to take
 * a write action, and nothing happens until the owner approves or denies it.
 *
 * Only argument KEY NAMES are ever shown, never values or file names — the same
 * PII bar the trace holds. Survives reload: the persisted trace carries the
 * status + the paused-run id, so a refreshed conversation still offers the card.
 */
export function ConfirmationCard({ call, onDecision }: ConfirmationCardProps) {
  const [submitting, setSubmitting] = useState(false);
  const label = toolLabel(call.name);
  const argKeys = readArgKeys(call.input);

  // The action sentence: "create file on Google Drive". label.server is null for
  // a non-namespaced tool, in which case the action alone reads fine.
  const actionSentence = label.server
    ? `${label.action} on ${label.server}`
    : label.action;

  function decide(decision: ConfirmationDecision) {
    if (submitting) return;
    setSubmitting(true);
    onDecision?.(decision);
  }

  const isPending = call.status === "awaiting_confirmation";

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-primary/25 bg-chat-cite-bg">
      <div className="flex items-start gap-3 px-4 py-3.5">
        <ShieldQuestionIcon
          aria-hidden
          strokeWidth={1.5}
          className="mt-px size-4 shrink-0 text-primary"
        />
        <div className="min-w-0 flex-1">
          {isPending ? (
            <p className="text-[13.5px] leading-[1.5] text-foreground">
              This agent wants to {actionSentence}. Approve it to let the action
              run, or deny it to keep it from running.
            </p>
          ) : call.status === "denied" ? (
            <p className="text-[13.5px] leading-[1.5] text-muted-foreground">
              You declined this action, so nothing was sent or created.
            </p>
          ) : (
            <p className="text-[13.5px] leading-[1.5] text-muted-foreground">
              You approved this action. It will run in an upcoming update; nothing
              has been sent or created yet.
            </p>
          )}

          {argKeys.length > 0 ? (
            <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.05em] text-caption">
              {label.full} · {argKeys.join(", ")}
            </p>
          ) : (
            <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.05em] text-caption">
              {label.full}
            </p>
          )}

          {isPending && onDecision ? (
            <div className="mt-3 flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => decide("approve")}
                disabled={submitting}
              >
                Approve
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => decide("deny")}
                disabled={submitting}
              >
                Deny
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
