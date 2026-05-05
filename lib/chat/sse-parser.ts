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
 * \n; expand if the contract evolves.
 */

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
  status: "running" | "done" | "error";
  started_at: string;
  finished_at?: string;
  error?: string;
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
