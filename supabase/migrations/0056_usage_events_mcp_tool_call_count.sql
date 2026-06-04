-- ============================================================================
-- 0056_usage_events_mcp_tool_call_count.sql
-- MCP, flag 2 Phase 2 (2P-6b) — per-turn MCP tool-call count on the cost ledger
-- ============================================================================
--
-- The gated agentic MCP tool-use loop (2P-6b) can call an org's connected MCP
-- read tools across multiple model rounds within one user turn. Tokens are summed
-- across all rounds into ONE usage_events row (the existing per-token pricing
-- applies; MCP tool calls have no separate Anthropic charge). This adds a per-turn
-- count of MCP tool calls, parallel to web_search_count, so the cost ledger
-- records how many MCP tools ran in the turn.
--
-- NOT NULL DEFAULT 0 so existing rows (and every non-loop turn) record 0. The chat
-- route writes the count when the loop runs; the loop only ever engages behind a
-- feature flag (default off) AND when the org has permitted+connected MCP tools.
--
-- Deploy ordering (chat never breaks): the route's usage insert is tolerant of
-- this column being absent — it attempts the insert WITH mcp_tool_call_count and,
-- on an "undefined column" error (Postgres 42703), retries without it so the usage
-- row is still recorded (the count is simply lost until this migration is applied).
-- So the 2P-6b code can deploy BEFORE this migration; applying it makes the count
-- persist.
--
-- RLS: NO change. The column rides the existing usage_events row and its policies.
--
-- Apply in the Supabase SQL Editor (the project's standard migration path).
-- ============================================================================

alter table public.usage_events
  add column if not exists mcp_tool_call_count integer not null default 0;

comment on column public.usage_events.mcp_tool_call_count is
  'Phase 2 (2P-6b): the number of MCP tool calls the agentic loop made in this user turn (reads executed plus writes held for confirmation). 0 for non-loop turns. MCP tool calls carry no separate Anthropic charge; the summed token cost is in the other columns.';


-- ============================================================================
-- Done.
-- ============================================================================
-- Verification (run in the SQL Editor after applying):
--
--   -- 1. The column exists with the expected type and default:
--   select column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'usage_events'
--     and column_name = 'mcp_tool_call_count';
--   -- expect data_type = integer, column_default = 0, is_nullable = NO
--
--   -- 2. Existing rows defaulted to 0:
--   select count(*) as total,
--          count(*) filter (where mcp_tool_call_count = 0) as zeroed
--   from public.usage_events;
--   -- expect zeroed = total.
-- ============================================================================
