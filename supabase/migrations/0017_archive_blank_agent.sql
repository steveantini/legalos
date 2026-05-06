-- ============================================================================
-- legalOS
-- Migration 0017 — Archive the per-department Blank Agent rows
--                    (Phase 2, Session 21)
-- ============================================================================
--
-- Session 21 dropped the Templates section from the department launchpad
-- (`app/(workspace)/departments/[slug]/page.tsx`) and replaced it with a
-- "+ New Agent" button in the page header. The Blank Agent template —
-- one row per department, slug `blank-agent-<dept-slug>`, seeded by
-- `supabase/seed/0004_blank_agents.sql` and (for the three later
-- departments) by `supabase/migrations/0012_department_changes.sql` —
-- was the canonical "start from scratch" entry inside that section. With
-- the section gone, the rows have no surface to render on; users now
-- start from scratch via the page-header button which routes to
-- `/agents/new?department=<slug>` directly.
--
-- This migration soft-archives every active Blank Agent row by flipping
-- `is_active = false`. We DON'T hard-delete:
--   - Existing user forks of a Blank Agent (created via the now-retired
--     Templates → fork flow) carry their own rows with their own ids;
--     they're independent of the source Blank Agent and stay active.
--   - Soft-archive preserves the rows for audit / forensic queries and
--     keeps the rollback story simple (just flip the flag back).
--   - `deleted_at` stays NULL — soft-archive uses `is_active`, not the
--     30-day undo-window column; these aren't user-facing trash.
--
-- The launchpad query (`getAgentsForDepartmentLaunchpad`) filters on
-- `is_active = true` for both `departmentAgents` and `myAgents`
-- buckets, so archived rows disappear from the launchpad. The query
-- ALSO no longer reads `is_template = true` rows (Templates bucket
-- dropped); the archived Blank Agents would have been excluded by
-- bucket-removal alone, but we archive them too so they don't appear
-- in any future reintroduction of a template surface without an
-- explicit unarchive step.
--
-- Idempotence: WHERE clause includes `is_active = true`. Re-running on
-- already-archived rows is a no-op.
--
-- Companion change: `supabase/seed/0004_blank_agents.sql` is updated in
-- the same commit so a fresh dev re-seed reproduces the post-migration
-- state (rows still INSERTED for forensic completeness; INSERT and
-- ON CONFLICT both set `is_active = false`).
-- ============================================================================

begin;

update public.agents
   set is_active = false
 where slug like 'blank-agent-%'
   and is_template = true
   and is_active = true;

commit;

-- ============================================================================
-- Reverse (do not run unless the Templates section returns and the
-- Blank Agent is restored as a canonical fork-source; the seed file
-- would also need reverting in tandem):
--
-- begin;
-- update public.agents
--    set is_active = true
--  where slug like 'blank-agent-%'
--    and is_template = true
--    and is_active = false;
-- commit;
-- ============================================================================
