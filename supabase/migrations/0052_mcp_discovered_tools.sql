-- ============================================================================
-- 0052_mcp_discovered_tools.sql
-- MCP, flag 2b-iii — store an MCP server's discovered tool catalog at connect
-- ============================================================================
--
-- When an MCP server connects (flag 2b-ii), legalOS discovers the tools it
-- offers (tools/list) and records the catalog so a connected server can show
-- what it can do without a per-render network call. This adds one nullable jsonb
-- column to the existing connections table to hold that catalog.
--
-- Shape: a McpToolDescriptor[] (lib/connections/providers/types.ts) — each
-- { name, description?, inputSchema }. Null means tools were not discovered
-- (discovery is best-effort at connect; a momentary failure does not fail the
-- connection — connected-but-tools-unknown is a valid honest state). Refreshing
-- the catalog is an explicit future action, never a silent per-render fetch; the
-- stored catalog is also the substrate that a future discovery pass compares
-- against (flag 4).
--
-- RLS: NO change needed. discovered_tools rides the existing connections row, so
-- the table's existing RLS (read/write governance, incl. org connections being
-- super-admin-write and grant-less/super-admin-read) already covers it. The tool
-- catalog is non-sensitive (tool names/descriptions/schemas), not a credential.
--
-- Deploy ordering (connecting never breaks): the MCP callback's tool-catalog
-- update is best-effort and tolerates this column being absent (an update error
-- on an unknown column is caught; the connection still succeeds without a
-- catalog). So the 2b-iii code can deploy BEFORE this migration is applied;
-- applying it is what makes catalogs persist. No MCP connection exists yet, so
-- there is nothing to backfill; catalogs are stored for connections made after
-- the migration is applied.
--
-- Apply in the Supabase SQL Editor (the project's standard migration path).
-- ============================================================================

alter table public.connections
  add column discovered_tools jsonb;

comment on column public.connections.discovered_tools is
  'For MCP connections: the server''s tool catalog discovered at connect, as a McpToolDescriptor[] JSON array (each { name, description?, inputSchema }). Null means tools were not discovered (best-effort at connect; refreshing is an explicit action). Non-credential; not read as authority for trust (trust is derived from the server id).';


-- ============================================================================
-- Done.
-- ============================================================================
-- Verification (run in the SQL Editor after applying):
--
--   -- 1. The column exists with the expected type and is nullable:
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'connections'
--     and column_name = 'discovered_tools';
--   -- expect data_type = jsonb, is_nullable = YES
--
--   -- 2. Existing rows are unaffected (discovered_tools null until a catalog is stored):
--   select count(*) as total, count(discovered_tools) as with_tools
--   from public.connections;
--   -- expect with_tools = 0 until an MCP server connects and discovery succeeds.
-- ============================================================================
