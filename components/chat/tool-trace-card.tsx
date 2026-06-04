"use client";

import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { ChatToolCall } from "@/lib/chat/sse-parser";
import { toolLabel } from "@/lib/chat/tool-display";

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

/** web_search is the hosted tool; everything else is a namespaced MCP tool. */
type ToolKind = "web_search" | "mcp";

function kindOf(name: string): ToolKind {
  return name === "web_search" ? "web_search" : "mcp";
}

/**
 * Human-friendly header label for a call. For web_search this is "Web
 * search"; for an MCP call it's "<Server>: <action>" derived from the
 * namespaced name (e.g. gdrive__search_files → "Google Drive: search
 * files"). Derived purely from the name so it reads the same while a call
 * streams and after a reload. See lib/chat/tool-display.ts.
 */
function displayToolName(rawName: string): string {
  return toolLabel(rawName).full;
}

/**
 * A held write (2P-6b v1 policy): the model requested a write tool, which is
 * held with a needs-confirmation result rather than executed, so nothing is
 * sent, created, or deleted. The loop records this as status "error" with the
 * `write_blocked` code on BOTH the live event and the persisted record, so we
 * detect it by code and render it as held (calm), not failed (alarming). The
 * interactive approval that replaces the hold lands in 2P-7b.
 */
function isHeldWrite(call: ChatToolCall): boolean {
  return call.error === "write_blocked";
}

/**
 * Defensive read of the search query from Anthropic's `web_search` tool
 * input. The shape is { query: string } per the SDK; we narrow rather
 * than trust an unknown coming from JSONB. MCP calls persist only a
 * PII-safe argument-key summary (never a `query`), so this returns null
 * for them and no query box renders — we never surface raw argument
 * values or file names.
 */
function readQuery(input: unknown): string | null {
  if (input && typeof input === "object" && "query" in input) {
    const q = (input as { query?: unknown }).query;
    if (typeof q === "string" && q.length > 0) return q;
  }
  return null;
}

/** Calm/alarming tone for a trace's status, driving text color + border. */
type ToolTone = "running" | "done" | "error" | "held";

/**
 * Status text + tone for either a singleton call OR a group of calls (a
 * group is always the same tool name, so its kind is uniform).
 *
 *   - any running        → "Searching" (web) / "Running" (MCP)
 *   - all held writes     → "Needs confirmation" (calm — nothing was sent)
 *   - any true error      → "Failed (N of M)" (web) / "Couldn't complete" (MCP)
 *   - otherwise           → "Searched" (web) / "Done" (MCP)
 *
 * web_search keeps its exact prior wording and "Failed (N of M)" behavior;
 * only MCP gains the calmer "Couldn't complete" / held wording.
 */
function statusOf(toolCalls: ChatToolCall[]): {
  text: string;
  tone: ToolTone;
  isError: boolean;
  isRunning: boolean;
} {
  const kind = kindOf(toolCalls[0].name);
  const total = toolCalls.length;

  if (toolCalls.some((c) => c.status === "running")) {
    return {
      text: kind === "web_search" ? "Searching" : "Running",
      tone: "running",
      isError: false,
      isRunning: true,
    };
  }

  if (kind === "web_search") {
    const errors = toolCalls.filter((c) => c.status === "error").length;
    if (errors > 0) {
      return {
        text: `Failed (${errors} of ${total})`,
        tone: "error",
        isError: true,
        isRunning: false,
      };
    }
    return { text: "Searched", tone: "done", isError: false, isRunning: false };
  }

  // MCP: separate held writes (calm) from true failures (warn).
  const held = toolCalls.filter(isHeldWrite).length;
  const trueErrors = toolCalls.filter(
    (c) => c.status === "error" && !isHeldWrite(c),
  ).length;

  if (trueErrors > 0) {
    return {
      text:
        total === 1
          ? "Couldn't complete"
          : `Couldn't complete (${trueErrors} of ${total})`,
      tone: "error",
      isError: true,
      isRunning: false,
    };
  }
  if (held > 0) {
    return {
      text: total === 1 ? "Needs confirmation" : `Needs confirmation (${held})`,
      tone: "held",
      isError: false,
      isRunning: false,
    };
  }
  return { text: "Done", tone: "done", isError: false, isRunning: false };
}

/** Tone → text color for a status word or an MCP result line. */
function toneTextClass(tone: ToolTone): string {
  if (tone === "error") return "text-warn-fg";
  if (tone === "held") return "text-muted-foreground";
  return "text-muted-foreground";
}

/**
 * Per-call result line for the expanded panel.
 *
 *   web_search → "Cited N source(s)" from its own source_ids attribution;
 *   an error shows the error code; a streaming/un-attributed call shows
 *   "—" so the row honestly says "we don't know yet."
 *
 *   MCP → a calm one-liner: a held write explains nothing ran; a true
 *   error surfaces the safe `error_message` (the persisted reason, e.g. a
 *   Google permission message), falling back to a generic line; a success
 *   confirms completion. Never surfaces raw arguments or file names.
 */
function resultLine(
  call: ChatToolCall,
  messageIsHydrated: boolean,
): { text: string; tone: ToolTone } {
  if (kindOf(call.name) === "web_search") {
    if (call.status === "error") {
      return { text: call.error ?? "Tool returned an error.", tone: "error" };
    }
    const sourceIds = call.output?.source_ids ?? [];
    const knowsCount = messageIsHydrated && call.status === "done";
    if (!knowsCount) return { text: "—", tone: "done" };
    return {
      text:
        sourceIds.length === 1
          ? "Cited 1 source"
          : `Cited ${sourceIds.length} sources`,
      tone: "done",
    };
  }

  // MCP
  if (isHeldWrite(call)) {
    return {
      text: "Held. This action needs your confirmation before it runs, so nothing was sent, created, or deleted.",
      tone: "held",
    };
  }
  if (call.status === "error") {
    return {
      text: call.error_message ?? "This tool call couldn't be completed.",
      tone: "error",
    };
  }
  if (call.status === "running") {
    return { text: "Running…", tone: "done" };
  }
  return { text: "Completed.", tone: "done" };
}

/**
 * Polished trace card — chat-aperture-spec.md §2.5 + Step C addendum
 * grouping, extended for MCP tools in 2P-7a. Default collapsed; click the
 * header row to toggle. The card border lifts to warn-fg/30 only on a true
 * error; a held write stays calm (it isn't a failure).
 *
 * The header reads a friendly label — "Web search" for the hosted tool,
 * "<Server>: <action>" for an MCP call (e.g. "Google Drive: search files")
 * — plus an understated status (Searching/Running, Searched/Done, Needs
 * confirmation, Couldn't complete). This is presentation only; it renders
 * from the trace the loop already persists, with no change to what's sent
 * to any server.
 *
 * Singleton (toolCalls.length === 1): one row in the expanded panel.
 * Group (toolCalls.length > 1): header gains " · {N} queries|calls";
 * the expanded panel lists per-call rows separated by hairlines. web_search
 * rows keep their Query + Result layout; MCP rows show a single calm status
 * line (never raw arguments or file names).
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
  // web_search collapses parallel "queries"; an MCP group collapses "calls".
  const countNoun = kindOf(head.name) === "web_search" ? "queries" : "calls";

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
    ? `${displayToolName(head.name)} tool trace, ${toolCalls.length} ${countNoun}, ${status.text.toLowerCase()}`
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
        <span className={toneTextClass(status.tone)}>{status.text}</span>
        {isGroup ? (
          <>
            <span className="text-caption" aria-hidden>
              ·
            </span>
            <span className="text-muted-foreground">
              {toolCalls.length} {countNoun}
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
 * Expanded-panel row body, used by both the singleton panel and each row
 * of a multi-call group so the two paths stay visually consistent.
 *
 * web_search keeps the Query + Result layout (its input carries a real
 * query). An MCP call has no query to show (only a PII-safe argument-key
 * summary, which we deliberately don't surface), so it renders a single
 * calm status line: held, the safe failure reason, or completion.
 */
function ToolTraceRowBody({ call, messageIsHydrated }: RowBodyProps) {
  const result = resultLine(call, messageIsHydrated);

  if (kindOf(call.name) === "mcp") {
    return (
      <p className={`flex-1 text-[13px] ${toneTextClass(result.tone)}`}>
        {result.text}
      </p>
    );
  }

  const query = readQuery(call.input);
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
            result.tone === "error" ? "text-warn-fg" : "text-foreground"
          }`}
        >
          {result.text}
        </p>
      </div>
    </div>
  );
}
