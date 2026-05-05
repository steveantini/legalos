"use client";

import { DownloadIcon } from "lucide-react";

import { modelDisplayName } from "@/lib/llm/model-label";

/**
 * Empty-state attachment row shape — id + filename + size are enough.
 * The full-text extraction sits server-side and isn't needed for
 * display; download lands via the new GET /api/attachments/[id]/download
 * endpoint (Session 19), which signs against the agent-attachments
 * bucket and 302s the browser to the signed URL.
 */
export interface EmptyStateAttachment {
  id: string;
  originalFilename: string;
  sizeBytes: number;
}

interface ChatEmptyStateProps {
  agentName: string;
  agentDescription: string | null;
  agentModel: string;
  webSearchEnabled: boolean;
  agentUpdatedAt: string;
  attachments: EmptyStateAttachment[];
}

/**
 * Pre-first-message identity panel per chat-aperture-spec.md §2.8.
 *
 *   "When the conversation has zero messages, the message list area is
 *    replaced with a centered identity panel: Lead, Description, Facts
 *    row (Model / Web search / Last updated), File list. No suggested
 *    prompts. The agent's identity is the empty state."
 *
 * Vertical centering: the parent (MessageList scroll container) is a
 * flex child with `flex-1 min-h-0 overflow-y-auto` inside ChatInterface's
 * flex column, which itself sits inside a fully height-constrained
 * ancestor chain (workspace grid 1fr → flex-col → page main flex-1 →
 * ChatInterface flex-1). The chain is intact, so `h-full` on the empty
 * state outer div resolves against the scroll container's definite
 * height; flex-col + justify-center centers the inner panel along the
 * vertical (main) axis. `min-h-full` (the previous attempt) didn't
 * trigger centering because it left the wrapper at content height with
 * no centering rule on the cross-axis flex behavior. Horizontal: the
 * inner panel uses `max-w-3xl mx-auto` to share the chat surface's
 * common vertical centerline.
 *
 * The lead "Start with [Agent name]." renders the agent name in
 * `text-primary` (slate-blue, the same token citation chips use)
 * at weight 500, against the surrounding 32px display in default
 * weight. Description (when present) sits at 14.5px in the same
 * prose-foreground tone the assistant prose uses.
 *
 * Facts row is three equal columns separated by gap, no rules. Each
 * column has a mono-caps label on top and the value in display weight
 * below. Mono-caps treatment matches the `MODEL` chip in `<AgentHeader>`
 * (font-mono, 11px, uppercase, tracking 0.08em, text-caption).
 *
 * File list renders only when attachments.length > 0. Each row is a
 * tinted card matching the user-bubble pattern (`bg-chat-user-bubble-bg`,
 * `border-border`, `rounded-[10px]`) so it visually sits as legitimate
 * agent content. Filename truncates with ellipsis at row width; size
 * renders in mono-caps to the right; a download affordance fades in
 * on row hover (opacity-0 → group-hover:opacity-100 → focus-visible:
 * opacity-100, mirroring the DownloadMessageButton pattern from chat
 * messages). Click navigates to the signed-URL redirect endpoint.
 *
 * No suggested prompts (spec §2.8). The legacy "Tip:" copy is gone.
 */
export function ChatEmptyState({
  agentName,
  agentDescription,
  agentModel,
  webSearchEnabled,
  agentUpdatedAt,
  attachments,
}: ChatEmptyStateProps) {
  return (
    <div className="flex h-full w-full flex-col justify-center py-12">
      <div className="mx-auto flex w-full max-w-3xl flex-col">
        {/* Lead */}
        <h2 className="text-[32px] leading-[1.1] tracking-[-0.022em] text-foreground">
          Start with{" "}
          <span className="font-medium text-primary">{agentName}</span>.
        </h2>

        {/* Description — 12px below the lead */}
        {agentDescription ? (
          <p className="mt-3 text-[14.5px] leading-[1.6] text-foreground">
            {agentDescription}
          </p>
        ) : null}

        {/* Facts row — 20px below description, 16px below lead when no
            description (lead has more visual weight without the
            description softening the transition). The mt-* sits OUTSIDE
            the border-t hairline so the rule reads as a section
            separator at the gap, not at the content edge. */}
        <dl
          className={`grid grid-cols-3 gap-6 border-t border-border pt-4 ${
            agentDescription ? "mt-5" : "mt-4"
          }`}
        >
          <FactColumn
            label="Model"
            value={
              agentModel
                ? modelDisplayName(agentModel)
                : "—"
            }
          />
          <FactColumn
            label="Web search"
            value={webSearchEnabled ? "Enabled" : "Off"}
          />
          <FactColumn
            label="Last updated"
            value={formatLastUpdated(agentUpdatedAt)}
          />
        </dl>

        {/* File list — 28px below the facts row. Most distinct content
            block in the panel; deserves more breathing room. */}
        {attachments.length > 0 ? (
          <section
            aria-labelledby="empty-state-files-heading"
            className="mt-7"
          >
            <h3
              id="empty-state-files-heading"
              className="mb-2 font-mono text-[11px] uppercase tracking-[0.08em] text-caption"
            >
              Files
            </h3>
            <ul className="space-y-2">
              {attachments.map((file) => (
                <li
                  key={file.id}
                  className="group/file flex items-center gap-3 rounded-[10px] border border-border bg-chat-user-bubble-bg px-4 py-3"
                >
                  <p className="min-w-0 flex-1 truncate text-[14px] text-foreground">
                    {file.originalFilename}
                  </p>
                  <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.05em] text-caption">
                    {formatBytes(file.sizeBytes)}
                  </span>
                  <a
                    href={`/api/attachments/${file.id}/download`}
                    aria-label={`Download ${file.originalFilename}`}
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity duration-[180ms] ease-out hover:bg-card hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/file:opacity-100 motion-reduce:opacity-100"
                  >
                    <DownloadIcon className="size-3.5" strokeWidth={1.5} />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function FactColumn({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-caption">
        {label}
      </dt>
      <dd className="text-[14.5px] leading-[1.4] text-foreground">{value}</dd>
    </div>
  );
}

/**
 * Format an ISO timestamp as `MAY 2, 2026` (mono caps in the consumer)
 * via Intl.DateTimeFormat. en-US gives "May 2, 2026"; uppercased to
 * match the chat surface's mono-caps treatment for static metadata.
 *
 * Returns "—" on parse failure rather than throwing — defensive for
 * rows that ever land here malformed.
 */
function formatLastUpdated(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
      .format(d)
      .toUpperCase();
  } catch {
    return "—";
  }
}

/**
 * Match the existing formatBytes helper from agent-attachments-section.tsx.
 * Kept as an inline copy rather than promoted to lib/ — two callers, both
 * presentation-layer, and the shape is small enough that one extraction
 * doesn't justify a new utility module.
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
