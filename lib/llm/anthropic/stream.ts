/**
 * Server-Sent Events helpers for the /api/chat streaming response.
 *
 * Per D-023 the chat route emits an SSE-compatible HTTP body with four
 * documented event types: meta, token, done, and error.
 *
 * Format (W3C SSE spec):
 *   event: <name>\n
 *   data: <JSON>\n
 *   \n                    ← blank line terminates the event
 *
 * The response uses Content-Type: text/event-stream so EventSource on the
 * client (8b) and `curl -N` smoke tests both consume it correctly.
 */

export type ChatStreamEvent =
  | {
      type: "meta";
      conversation_id: string;
      user_message_id: string;
    }
  | { type: "token"; text: string }
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
 * SSE response headers per the W3C spec + Vercel streaming requirements:
 *
 * - text/event-stream content type triggers EventSource on the client.
 * - no-cache, no-transform prevents intermediaries from buffering or
 *   replaying the stream.
 * - X-Accel-Buffering: no signals nginx-style proxies (and Vercel's edge)
 *   to disable response buffering, which is what makes token-by-token
 *   streaming actually appear token-by-token in the browser / curl.
 */
export const SSE_RESPONSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;
