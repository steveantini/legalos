"use client";

import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { ChatToolCall } from "@/lib/chat/sse-parser";

interface ToolTraceCardProps {
  /**
   * One or more tool calls grouped under a single card. A group of N
   * adjacent same-name calls (no prose between them, per buildBlocks
   * in message-bubble.tsx) renders as a single trace surface with the
   * count exposed in the header — frontier products (Claude.ai,
   * Perplexity, ChatGPT search) all collapse parallel calls this way
   * rather than stack identical cards.
   *
   * Singleton groups (toolCalls.length === 1) render exactly as
   * before grouping was introduced — header pattern, expanded panel,
   * everything matches the Step C baseline.
   */
  toolCalls: ChatToolCall[];
  /**
   * True when the parent message is fully persisted — drives whether
   * `output.source_ids.length === 0` should display as "0 sources" or
   * "—" (attribution not yet computed). Per Step B's attribution-timing
   * decision, streamed messages emit source_ids: [] regardless of how
   * many citations the tool produced; persisted records carry the real
   * attribution. Parent passes true when message id is server-issued.
   */
  messageIsHydrated: boolean;
  /**
   * Optional retry handler (Session 19, spec §2.9). When provided AND
   * the group surfaces an error state, a "Retry turn" button renders
   * at the bottom of the expanded panel. Click discards the partial
   * assistant turn and re-fires the user's last message — same
   * semantics as the stream-interrupted error banner. The callback
   * takes no parameters; the parent (MessageList) closes over the
   * messages array and computes the right cleanup.
   */
  onRetry?: () => void;
}

const FRIENDLY_TOOL_NAME: Record<string, string> = {
  web_search: "Web search",
};

function displayToolName(rawName: string): string {
  return FRIENDLY_TOOL_NAME[rawName] ?? rawName;
}

/**
 * Defensive read of the search query from Anthropic's `web_search` tool
 * input. The shape is { query: string } per the SDK; we narrow rather
 * than trust an unknown coming from JSONB.
 */
function readQuery(input: unknown): string | null {
  if (input && typeof input === "object" && "query" in input) {
    const q = (input as { query?: unknown }).query;
    if (typeof q === "string" && q.length > 0) return q;
  }
  return null;
}

/**
 * Status text + accent for either a singleton call OR a group of calls.
 * Group status logic per the addendum spec:
 *
 *   - any running    → "Searching" / "Running"
 *   - all done, no errors → "Searched" / "Done"
 *   - all done, ≥1 error  → "Failed (N of M)" where N is errors, M is total
 *
 * isError flag flips the status text to warn-fg and the card border to
 * warn-fg/30. For groups with mixed running+error, we treat the running
 * as winning visually (no error border yet) — once running completes,
 * the final state surfaces.
 */
function statusOf(toolCalls: ChatToolCall[]): {
  text: string;
  isError: boolean;
  isRunning: boolean;
} {
  const anyRunning = toolCalls.some((c) => c.status === "running");
  if (anyRunning) {
    const name = toolCalls[0].name;
    return {
      text: name === "web_search" ? "Searching" : "Running",
      isError: false,
      isRunning: true,
    };
  }
  const errors = toolCalls.filter((c) => c.status === "error").length;
  if (errors > 0) {
    return {
      text: `Failed (${errors} of ${toolCalls.length})`,
      isError: true,
      isRunning: false,
    };
  }
  const name = toolCalls[0].name;
  return {
    text: name === "web_search" ? "Searched" : "Done",
    isError: false,
    isRunning: false,
  };
}

/**
 * Per-call result line for the expanded panel. A successful call shows
 * "Cited N source(s)" using its own source_ids attribution; an error
 * call shows the error code in warn-fg; a streaming/un-attributed call
 * shows "—" so the row honestly says "we don't know yet."
 */
function resultText(
  call: ChatToolCall,
  messageIsHydrated: boolean,
): { text: string; isError: boolean } {
  if (call.status === "error") {
    return { text: call.error ?? "Tool returned an error.", isError: true };
  }
  const sourceIds = call.output?.source_ids ?? [];
  const knowsCount = messageIsHydrated && call.status === "done";
  if (!knowsCount) return { text: "—", isError: false };
  return {
    text:
      sourceIds.length === 1
        ? "Cited 1 source"
        : `Cited ${sourceIds.length} sources`,
    isError: false,
  };
}

/**
 * Polished trace card — chat-aperture-spec.md §2.5 + Step C addendum
 * grouping. Default collapsed; click the header row to toggle. The card
 * border lifts to warn-fg/30 when the group surfaces an error state.
 *
 * Singleton (toolCalls.length === 1): single Query + single Result in
 * the expanded panel, exactly as the Step C baseline.
 *
 * Group (toolCalls.length > 1): header gets " · {N} queries" appended;
 * expanded panel renders an ordered list of per-call rows separated
 * by hairlines. Each row carries its own Query box + Result line so
 * source attribution stays honest per query.
 *
 * Open state is local React state, not persisted — reload always boots
 * collapsed.
 */
export function ToolTraceCard({
  toolCalls,
  messageIsHydrated,
  onRetry,
}: ToolTraceCardProps) {
  const [open, setOpen] = useState(false);

  const status = statusOf(toolCalls);
  const isGroup = toolCalls.length > 1;
  const head = toolCalls[0];

  function toggle() {
    setOpen((prev) => !prev);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  }

  const ariaLabel = isGroup
    ? `${displayToolName(head.name)} tool trace, ${toolCalls.length} queries, ${status.text.toLowerCase()}`
    : `${displayToolName(head.name)} tool trace, ${status.text.toLowerCase()}`;

  return (
    <div
      className={`my-3 overflow-hidden rounded-lg border bg-paper-2 transition-colors duration-[180ms] ${
        status.isError ? "border-warn-fg/30" : "border-border-strong"
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={toggle}
        onKeyDown={onKeyDown}
        className="flex w-full cursor-pointer select-none items-center gap-3 px-4 py-3 text-[13px] hover:bg-card focus-visible:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
      >
        {status.isRunning ? (
          <span
            aria-hidden
            className="chat-trace-dot inline-block size-1.5 rounded-full bg-chat-trace-dot"
          />
        ) : null}
        <span className="font-medium text-foreground">
          {displayToolName(head.name)}
        </span>
        <span className="text-caption" aria-hidden>
          ·
        </span>
        <span
          className={status.isError ? "text-warn-fg" : "text-muted-foreground"}
        >
          {status.text}
        </span>
        {isGroup ? (
          <>
            <span className="text-caption" aria-hidden>
              ·
            </span>
            <span className="text-muted-foreground">
              {toolCalls.length} queries
            </span>
          </>
        ) : null}
        <ChevronDownIcon
          aria-hidden
          strokeWidth={1.5}
          className={`ml-auto size-4 text-muted-foreground transition-transform duration-[220ms] ease-[cubic-bezier(0.2,0.7,0.2,1)] ${
            open ? "rotate-180" : "rotate-0"
          }`}
        />
      </div>
      {open ? (
        <>
          {isGroup ? (
            <ol className="divide-y divide-border-strong/40 border-t border-border-strong/60">
              {toolCalls.map((call, idx) => (
                <li key={call.id} className="px-4 py-3 text-[13px]">
                  <div className="mb-2 flex items-baseline gap-3">
                    <span className="font-mono text-[11px] tabular-nums text-caption">
                      {idx + 1}
                    </span>
                    <ToolTraceRowBody
                      call={call}
                      messageIsHydrated={messageIsHydrated}
                    />
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="border-t border-border-strong/60 px-4 pb-4 pt-3 text-[13px]">
              <ToolTraceRowBody
                call={head}
                messageIsHydrated={messageIsHydrated}
              />
            </div>
          )}
          {status.isError && onRetry ? (
            <div className="flex justify-end border-t border-border-strong/60 px-4 py-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onRetry}
                className="font-mono text-[11px] uppercase tracking-[0.06em] text-warn-fg-deep hover:bg-warn-fg/10 hover:text-warn-fg-deep"
              >
                Retry turn
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

interface RowBodyProps {
  call: ChatToolCall;
  messageIsHydrated: boolean;
}

/**
 * Shared row body — same Query + Result layout used by both the
 * singleton expanded panel and each row of a multi-call group, so the
 * two rendering paths stay visually consistent.
 */
function ToolTraceRowBody({ call, messageIsHydrated }: RowBodyProps) {
  const query = readQuery(call.input);
  const result = resultText(call, messageIsHydrated);

  return (
    <div className="flex-1">
      {query ? (
        <div>
          <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.06em] text-caption">
            Query
          </div>
          <div className="rounded-md bg-chat-code-bg px-3 py-2 font-mono text-[12.5px] leading-[1.5] text-chat-code-fg">
            {query}
          </div>
        </div>
      ) : null}
      <div className={query ? "mt-3" : ""}>
        <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.06em] text-caption">
          Result
        </div>
        <p
          className={`text-[13px] ${
            result.isError ? "text-warn-fg" : "text-foreground"
          }`}
        >
          {result.text}
        </p>
      </div>
    </div>
  );
}
