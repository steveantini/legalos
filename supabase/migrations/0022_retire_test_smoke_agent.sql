-- ============================================================================
-- legalOS
-- Migration 0022 — Retire the Test Smoke Agent (Session 8a artifact)
-- ============================================================================
--
-- Soft-deletes the seed row at `supabase/seed/0003_test_native_agent.sql`
-- (slug 'test-smoke-agent'). The agent's own description states "Replaced
-- in Session 8c by promoting an existing Commercial agent to native" —
-- but no removal migration was written at the time, and migration 0019's
-- `created_by IS NULL` sweep subsequently promoted it to is_template=true,
-- which surfaces it in the Commercial launchpad's Department Agents
-- section. This migration completes the deferred retirement.
--
-- Soft-delete via the standard pattern: `is_active = false`,
-- `deleted_at = now()`. The launchpad query
-- (`getAgentsForDepartmentLaunchpad`) filters on
-- `is_active = true AND deleted_at IS NULL`, so the row disappears from
-- both Department Agents and My Agents views. The row stays in the DB
-- for lineage / forensic queries — same posture as migration 0017's
-- Blank Agent archive.
--
-- Idempotence: `WHERE deleted_at IS NULL` makes re-runs a no-op once the
-- row is soft-deleted.
-- ============================================================================

begin;

update public.agents
   set is_active  = false,
       deleted_at = now(),
       updated_at = now()
 where slug = 'test-smoke-agent'
   and deleted_at is null;

commit;

-- ============================================================================
-- Reverse (do not run unless the Session 8a smoke-test surface returns):
--
-- begin;
-- update public.agents
--    set is_active  = true,
--        deleted_at = null,
--        updated_at = now()
--  where slug = 'test-smoke-agent';
-- commit;
-- ============================================================================
