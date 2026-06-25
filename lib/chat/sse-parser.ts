/**
 * Client-side parser for the SSE response from /api/chat (D-023).
 *
 * Consumes a `fetch` response body as a ReadableStream and yields typed
 * ChatStreamEvent objects. Used instead of EventSource because EventSource
 * is GET-only and cannot carry the JSON request body (agent_id,
 * conversation_id, user_message) that the chat route requires.
 *
 * Frame format (matches lib/llm/anthropic/stream.ts on the server):
 *
 *   event: <name>\n
 *   data: <JSON>\n
 *   \n                        ← blank line terminates the frame
 *
 * Assumes single-line `data:` per frame, matching 8a's SSE contract.
 * SSE spec allows multi-line data: which would require concatenating with
 * \n; expand if the contract evolves. (A redline payload is JSON.stringify'd,
 * which never emits a newline, so even a large change set rides one data line.)
 */

import type { RedlinePayload } from "@/lib/agents/pre-steps/document-compare";

/**
 * One citation source referenced by an assistant message. Mirrors the
 * server-side ChatSource in lib/llm/anthropic/stream.ts.
 */
export type ChatSource = {
  id: string;
  title: string;
  url: string;
  domain: string;
  fetched_at?: string;
};

/**
 * Tool invocation record. Mirrors the server-side ChatToolCall.
 */
export type ChatToolCall = {
  id: string;
  name: string;
  input: unknown;
  output: { source_ids: string[] } | null;
  /**
   * Execution lifecycle. web_search / MCP reads use running → done | error. An
   * MCP WRITE paused for human confirmation (2P-7b) uses the confirmation
   * states: `awaiting_confirmation` (Approve/Deny pending), then `denied` or
   * `approved` (the write executes in 2P-7b-ii; until then nothing is sent).
   */
  status:
    | "running"
    | "done"
    | "error"
    | "awaiting_confirmation"
    | "denied"
    | "approved";
  started_at: string;
  finished_at?: string;
  error?: string;
  position: number;
  /**
   * For an MCP tool call (Phase 2): the token/PII-safe human-readable reason on
   * failure (e.g. a Google permission/scope message). Present on the persisted
   * record, so it surfaces after a reload; the live `tool_trace_error` event
   * carries only the `error` code, so it may be absent mid-stream. Absent on
   * success and for web_search. Mirrors the server-side ChatToolCall.
   */
  error_message?: string;
  /**
   * For an MCP tool call (Phase 2): the read/write classification. A 'write'
   * call is held with a needs-confirmation result rather than executed in v1
   * (2P-6b), so the trace renders it as held, not failed. Present on the
   * persisted record; absent mid-stream and for web_search.
   */
  access?: "read" | "write";
  /** For an MCP tool call: the server id the tool belongs to. Absent for web_search. */
  server?: string;
  /**
   * For a paused MCP write (2P-7b): the paused-run record this confirmation is
   * wired to, so the UI can render the Approve/Deny card and resume the loop
   * from the persisted trace alone (a reload still surfaces the decision).
   */
  confirmation?: { paused_run_id: string };
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
      // The loop paused on a write tool and awaits a human decision (2P-7b).
      type: "tool_confirmation_required";
      paused_run_id: string;
      assistant_message_id: string;
      tool_call_id: string;
      tool_name: string;
      server: string;
      access: "write";
      arg_keys: string[];
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
      // Document-comparison visual redline payload (D-189). Mirrors the
      // server-side event; carries the same change set the prose was built from.
      type: "pre_step_redline";
      payload: RedlinePayload;
    }
  | {
      type: "done";
      assistant_message_id: string;
      tokens_in: number;
      tokens_out: number;
    }
  | { type: "error"; error: string };

export async function* parseSseStream(
  response: Response,
): AsyncGenerator<ChatStreamEvent> {
  const body = response.body;
  if (!body) return;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separatorIndex: number;
    while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      const eventLine = frame.match(/^event: (.+)$/m);
      const dataLine = frame.match(/^data: (.+)$/m);
      if (!eventLine || !dataLine) continue;

      try {
        const data = JSON.parse(dataLine[1]);
        yield { type: eventLine[1], ...data } as ChatStreamEvent;
      } catch {
        // Malformed frame — skip rather than crash the stream.
      }
    }
  }
}
