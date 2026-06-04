-- ============================================================================
-- 0055_govern_mcp_connection_category.sql
-- MCP, flag 2 Phase 2 — make 'mcp' a governed Allowed-connections category
-- ============================================================================
--
-- MCP-to-agent access is now governed at the ORG level by the super admin via two
-- existing levers, BOTH of which must agree: (1) the Allowed-connections policy
-- permits the 'mcp' capability category, and (2) the specific server is connected
-- and healthy (Phase 1). 'mcp' was previously only a DESCRIPTIVE
-- capability_category label on connections; this makes it a GOVERNED category in
-- the connection_policy.allowed_categories allowlist, so the super admin can
-- permit or deny MCP-type connections org-wide from Policy & access. The category
-- is meaningful because the org also has NON-MCP connections (the OAuth data-
-- source connectors), so the policy governs which KINDS are allowed.
--
-- No structural change: allowed_categories is already text[] (migration 0044), so
-- 'mcp' is just another category string. This migration (a) permits 'mcp' for the
-- existing org and (b) updates the column DEFAULT so fresh installs include it.
--
-- DEFAULT = PERMITTED. Connecting an MCP server already requires a deliberate
-- super-admin action, so requiring a second separate on-switch to use a server you
-- just connected is friction. The category switch's real value is the ability to
-- turn MCP usage OFF org-wide while keeping servers connected. So 'mcp' defaults
-- permitted; the super admin can deny it as an override.
--
-- RLS: NO change. allowed_categories rides the existing connection_policy row,
-- which is super-admin-write / any-authenticated-read under its existing policies.
--
-- Ordering: independent of the code deploy. The Allowed-connections UI and the
-- org-level resolver read whatever the row holds; applying this makes 'mcp'
-- permitted (the resolver's gate 1) for the existing org.
--
-- Apply in the Supabase SQL Editor (the project's standard migration path).
-- ============================================================================

-- (a) Permit 'mcp' for the existing singleton policy row (idempotent).
update public.connection_policy
  set allowed_categories = allowed_categories || array['mcp']::text[]
  where id = 1
    and not ('mcp' = any(allowed_categories));

-- (b) Fresh installs include 'mcp' in the seeded allowlist too.
alter table public.connection_policy
  alter column allowed_categories
  set default array[
    'file-storage', 'calendar', 'mail', 'messaging', 'matter-management', 'mcp'
  ]::text[];


-- ============================================================================
-- Done.
-- ============================================================================
-- Verification (run in the SQL Editor after applying):
--
--   -- 1. 'mcp' is permitted for the existing org:
--   select 'mcp' = any(allowed_categories) as mcp_permitted
--   from public.connection_policy where id = 1;
--   -- expect mcp_permitted = true.
--
--   -- 2. The column default now includes 'mcp' (fresh installs):
--   select column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'connection_policy'
--     and column_name = 'allowed_categories';
--   -- expect the default array to contain 'mcp'.
-- ============================================================================
