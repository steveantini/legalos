# Phase 2 (MCP agent tool-use) — design lock

**Status: design locked 2026-06-03 (2P-0). Authoritative spec for steps 2P-1 … 2P-7.**

MCP Phase 1 is complete and proven live: an organization connects trusted MCP
servers (Drive, Gmail, Calendar today), legalOS discovers and stores each
server's tool catalog, custody of every credential is ours, and the trusted-only
boundary is enforced. **Phase 2 lets agents actually USE those tools mid-
conversation, via a gated agentic loop on the chat hot path.**

The read-only investigation mapped the chat hot path and produced a 7-step
decomposition. This document locks the design so every step builds to a fixed
spec; it is referenced from `docs/CHATBOT_HANDOFF.md` and `docs/ROADMAP.md`, and
summarized as DECISION_LOG D-100.

## Locked decisions

### 1. Tool namespacing

Connected MCP tools are exposed to the model as **server-prefixed Anthropic custom
tools**, format `<shortPrefix>__<originalToolName>` (double-underscore separator):
`gdrive__search_files`, `gmail__create_draft`, `gcal__list_events`. The name must
satisfy Anthropic's `^[A-Za-z0-9_-]{1,64}$` and be unique per request; the short
per-server prefixes (`gdrive`, `gmail`, `gcal` for the three Google servers; a
clean scheme for future servers) keep names well under 64 chars. A **server-side
routing map** resolves a namespaced tool name back to
`{ connectionId, tokenRef, serverUrl, originalToolName }`, so a `tool_use` routes
to the right connection/server.

### 2. Governance — which tools an agent may use (two layers)

Mirrors the platform's existing two-layer pattern:

- **Org layer (Phase 1, exists):** a connected MCP server is POSSIBLE for the org;
  a super admin governs connect/disconnect.
- **Agent layer (Phase 2):** the **agent author enables which connected SERVERS
  this agent may use**, at **per-server granularity for v1** (e.g. this agent may
  use Drive and Calendar but not Gmail). Per-tool granularity is a later
  refinement.

The agentic loop only exposes tools from servers the agent has enabled AND that
are connected for the org. Either condition failing means the tool is not exposed.

### 3. Write-tool policy (v1)

**Auto-run READ tools; BLOCK WRITE tools.** A write tool's `tool_use` returns a
`tool_result` stating the action needs confirmation and is not yet enabled, so
nothing is silently sent, created, or deleted in a user's Gmail/Drive/Calendar.

Classification is by **captured MCP annotations** (`readOnlyHint` /
`destructiveHint` from the MCP `tools/list` `ToolAnnotations`), captured at
discovery in 2P-4, **not** by name heuristics. **Conservative default: a tool with
no annotation is treated as WRITE and blocked** — safety over reach when the
server doesn't declare a hint.

Interactive mid-stream write-confirmation (surface a confirm request, pause,
await approve/deny) is **deferred to 2P-7** as its own deliberate step.

### 4. Max-iterations + wall-clock guard

The loop runs at most **8 tool ROUNDS per user turn**, and stops initiating new
tool rounds past a **wall-clock budget (~240s)** inside the route's 300s
`maxDuration`, whichever comes first; it then forces a final model turn **without
tools**. This bounds runaway cost and stays inside serverless limits.

### 5. Token accounting

**One summed `usage_events` row per user turn** (sum tokens across all loop
iterations), plus a new additive **`mcp_tool_call_count`** column (parallel to
`web_search_count`). Honest note: each tool round re-sends the growing message
history, so cost grows **super-linearly** with rounds; the single summed row keeps
accounting truthful and matches the current one-row-per-message model.

### 6. Tracing (the audit trail)

Reuse the existing **`tool_calls` JSONB** (on the assistant message) + structured
server logs. Persist, per MCP tool call: server/connection, tool name, an **args
SUMMARY** (not the full PII-laden payload), result status, and timing. Logs stay
**token- and PII-free** (as the Phase 1 `McpClientError` already is).

## Build order (off the hot path first)

1. **2P-1 — execution-resolution reader.** Resolve an org's connected MCP servers
   to `{ serverId, connectionId, tokenRef, serverUrl, trustTier, tools }` (the
   connection id + token reference `getOrgMcpConnections` doesn't expose). Pure
   read; unused until 2P-6.
2. **2P-2 — tool mapping + namespacing.** Connected tools → namespaced Anthropic
   custom tool defs + the routing map; `input_schema` normalize; widen the
   `AnthropicTool` union.
3. **2P-3 — single-tool execution.** `getUsableAccessToken` → `callMcpServerTool`
   → shape a `tool_result` (+ typed errors). Reuses Phase 1 client + token layer.
4. **2P-4 — read/write classification.** Capture `readOnlyHint`/`destructiveHint`
   at discovery; a classifier (no-annotation ⇒ write).
5. **2P-5 — governance.** Per-agent enablement of connected servers (agent-form
   UI + the resolver that filters 2P-2's list). May carry an additive migration.
6. **2P-6 — the agentic loop (HOT PATH, gated, flagged).** `chat.ts` surfaces
   client `tool_use`/`stop_reason` and accepts content-block messages; the route
   loops execute → feed-back → re-stream under the 8-round/wall-clock guard;
   tokens summed into one `usage_events` row (+ `mcp_tool_call_count`); reads run,
   writes blocked (2P-4) within enabled servers (2P-5); each call surfaced via the
   existing `tool_trace_*` events.
7. **2P-7 — UI + optional interactive write-confirm.** MCP friendly names / args /
   result rendering in the trace card; the composer indicator for MCP-enabled
   agents; the deferred mid-stream confirmation UX.

## Gating principle

Agents with **no enabled-and-connected MCP tools take the byte-identical current
single-pass path** — the loop engages only when resolved tools exist. The loop
ships **behind a flag** (the exact gate decided at 2P-6) so rollout is safe and
reversible.

## Correctness trap (must hold)

Conversation history is loaded and replayed as `{ role, content: string }`. The
loop must **flatten a multi-call turn to the final assistant TEXT + the
`tool_calls` JSONB**, so the string-based history stays uncorrupted on reload and
replay. The intermediate `tool_use`/`tool_result` content blocks live only inside
the single turn's execution, never in the persisted string history.

## Why this shape

Off-hot-path, behavior-neutral steps land first; the one hot-path change (the
loop) lands last, gated and flagged, so no-MCP agents are byte-identical. v1 runs
reads and blocks writes so the loop is proven safely before any agent takes a real
action in a user's Gmail/Drive/Calendar; write-confirmation is a deliberate later
step. Per-server agent governance mirrors the platform's existing two-layer
pattern. The guards bound cost and runtime.
