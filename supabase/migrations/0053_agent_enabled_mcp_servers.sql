-- ============================================================================
-- 0053_agent_enabled_mcp_servers.sql
-- MCP, flag 2 Phase 2 (2P-5) — per-agent MCP-server governance
-- ============================================================================
--
-- The locked two-layer governance model (D-100): the ORG connects an MCP server
-- (super-admin, Phase 1), and the AGENT AUTHOR enables which connected SERVERS a
-- given agent may use (per-server granularity for v1). This adds the agent-side
-- layer: a jsonb array of the MCP server ids (serverId / provider_id) this agent
-- is allowed to use.
--
-- Separate from agents.tools_enabled: tools_enabled holds Anthropic HOSTED-tool
-- toggles (web_search); enabled_mcp_servers is a distinct governance axis (which
-- connected MCP servers this agent reaches). Keeping them separate keeps the two
-- axes legible.
--
-- Runtime guarantee (the resolver, lib/connections/mcp/agent-tools.ts): an agent
-- gets a server's tools ONLY when the server is in BOTH this list AND the org's
-- currently-connected+healthy MCP connections. The intersection is computed live,
-- so disconnecting or erroring a server instantly revokes it from every agent with
-- no stale grants; an unauthorized or never-connected id contributes nothing.
--
-- Default '[]': existing agents enable no MCP servers, so the agentic loop offers
-- them nothing until an author opts in (safe default).
--
-- RLS: NO change needed. enabled_mcp_servers rides the existing agents row, so the
-- table's existing RLS already covers it. The value is non-sensitive (server ids).
--
-- Deploy ordering (agent create/edit never breaks): the create/update actions
-- persist this column with a SEPARATE best-effort write that tolerates the column
-- being absent (an update error with code 42703 is ignored; the agent is still
-- saved), and the form/pages read it tolerantly (default []). So the 2P-5 code can
-- deploy BEFORE this migration is applied; applying it is what makes per-agent MCP
-- enablement persist. Existing agents default to '[]' (none enabled); nothing to
-- backfill.
--
-- Apply in the Supabase SQL Editor (the project's standard migration path).
-- ============================================================================

alter table public.agents
  add column if not exists enabled_mcp_servers jsonb not null default '[]'::jsonb;

comment on column public.agents.enabled_mcp_servers is
  'Phase 2 (2P-5): the MCP server ids (serverId / provider_id) this agent may use, set by the agent author. The agentic loop offers an agent a server''s tools only when the server is in BOTH this list AND the org''s currently-connected+healthy MCP connections (the resolver intersects them at runtime, so disconnect/error instantly revokes with no stale grants). Separate from tools_enabled, which is for Anthropic hosted-tool toggles (web_search). Default ''[]'': existing agents enable no MCP servers until an author opts in.';


-- ============================================================================
-- Done.
-- ============================================================================
-- Verification (run in the SQL Editor after applying):
--
--   -- 1. The column exists with the expected type, default, and not-null:
--   select column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'agents'
--     and column_name = 'enabled_mcp_servers';
--   -- expect data_type = jsonb, column_default = '[]'::jsonb, is_nullable = NO
--
--   -- 2. Every existing agent defaulted to the empty array (none enabled):
--   select count(*) as total,
--          count(*) filter (where enabled_mcp_servers = '[]'::jsonb) as empty
--   from public.agents;
--   -- expect empty = total.
-- ============================================================================
