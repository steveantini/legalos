-- ============================================================================
-- 0054_drop_agent_enabled_mcp_servers.sql
-- MCP, flag 2 Phase 2 — reverse 2P-5 (remove per-agent MCP enablement)
-- ============================================================================
--
-- 2P-5 (migration 0053, D-103) added agents.enabled_mcp_servers to let an agent
-- AUTHOR pick which connected MCP servers an agent may use. That model is reversed
-- (see the new decision superseding D-103): basic users author their own agents,
-- so per-agent super-admin gating is impractical. MCP-to-agent access is now
-- governed entirely at the ORG level (the Allowed-connections 'mcp' category +
-- the server being connected and healthy). The per-agent column is no longer used
-- anywhere (it was never wired into the chat route — 2P-6 isn't built), so it is
-- dropped.
--
-- RLS: NO change. Dropping a column on the agents table doesn't affect its row
-- policies. No other agent behavior depends on this column (the create/edit/
-- template-create actions and the agent form no longer reference it).
--
-- Ordering: apply this AFTER the 2P-5-reversal code is deployed (the code no
-- longer reads or writes enabled_mcp_servers, so dropping it is safe either way;
-- `if exists` makes the migration idempotent and tolerant of order).
--
-- Apply in the Supabase SQL Editor (the project's standard migration path).
-- ============================================================================

alter table public.agents
  drop column if exists enabled_mcp_servers;


-- ============================================================================
-- Done.
-- ============================================================================
-- Verification (run in the SQL Editor after applying):
--
--   -- The column is gone:
--   select count(*) as still_present
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'agents'
--     and column_name = 'enabled_mcp_servers';
--   -- expect still_present = 0.
-- ============================================================================
