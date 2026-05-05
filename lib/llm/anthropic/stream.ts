/**
 * Server-Sent Events helpers for the /api/chat streaming response.
 *
 * Per D-023 the chat route emits an SSE-compatible HTTP body. Session 18b
 * extended the event vocabulary from { meta, token, done, error,
 * tool_use_start, tool_use_end, citations } to first-class trace + source
 * events:
 *
 *   meta             — first frame; conversation + user message ids
 *   token            — text delta (may include inline <sup ...> markers)
 *   tool_trace_start — server tool invocation began; { id, name, input, started_at }
 *   tool_trace_done  — tool invocation finished cleanly; { id, output, finished_at }
 *   tool_trace_error — tool invocation surfaced an error; { id, error, finished_at }
 *   source_added     — citation referenced a new URL; { id, title, url, domain, fetched_at? }
 *   done             — stream finalized successfully
 *   error            — fatal stream error before persistence
 *
 * Format (W3C SSE spec):
 *   event: <name>\n
 *   data: <JSON>\n
 *   \n                    ← blank line terminates the event
 */

/**
 * One citation source referenced by an assistant message. Generated
 * server-side when a citations_delta arrives; deduplicated within a
 * single message by URL.
 */
export type ChatSource = {
  id: string;
  title: string;
  url: string;
  domain: string;
  /** Optional ISO timestamp; reserved for tools that surface fetch time. */
  fetched_at?: string;
};

/**
 * Tool invocation record. `output` shape is tool-specific. For web_search
 * the live SSE event carries an empty source_ids array (attribution is
 * computed at end-of-stream and only present in the persisted record);
 * Step C polish may revisit live attribution. `status` collapses pending
 * + running into "running" — pending is too brief a window to render.
 */
export type ChatToolCall = {
  id: string;
  name: string;
  input: unknown;
  output: { source_ids: string[] } | null;
  status: "running" | "done" | "error";
  started_at: string;
  finished_at?: string;
  error?: string;
  /**
   * Character offset in the assistant body where this trace block slots in
   * during render. Captured server-side at tool_trace_start emit time.
   */
  position: number;
};

export type ChatStreamEvent =
  | {
      type: "meta";
      conversation_id: string;
      user_message_id: string;
    }
  | { type: "token"; text: string }
  | {
      type: "tool_trace_start";
      id: string;
      name: string;
      input: unknown;
      started_at: string;
      position: number;
    }
  | {
      type: "tool_trace_done";
      id: string;
      output: { source_ids: string[] } | null;
      finished_at: string;
    }
  | {
      type: "tool_trace_error";
      id: string;
      error: string;
      finished_at: string;
    }
  | {
      type: "source_added";
      id: string;
      title: string;
      url: string;
      domain: string;
      fetched_at?: string;
    }
  | {
      type: "done";
      assistant_message_id: string;
      tokens_in: number;
      tokens_out: number;
    }
  | { type: "error"; error: string };

const encoder = new TextEncoder();

/**
 * Encode a ChatStreamEvent into the wire-format bytes for a single SSE
 * event frame. The `type` discriminant becomes the SSE `event:` line; the
 * remaining fields are JSON-stringified into the `data:` line so the body
 * payload matches the contract documented in D-023.
 */
export function encodeSseEvent(event: ChatStreamEvent): Uint8Array {
  const { type, ...payload } = event;
  return encoder.encode(
    `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`,
  );
}

/**
 * SSE response headers per the W3C spec + Vercel streaming requirements.
 */
export const SSE_RESPONSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;
