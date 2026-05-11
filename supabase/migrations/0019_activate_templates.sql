-- ============================================================================
-- legalOS
-- Migration 0019 — Activate templates (Pattern B canonical agents)
--                   (Phase 2, Session 27)
-- ============================================================================
--
-- Promotes every system-seeded canonical agent (created_by IS NULL) to
-- is_template = true. After this migration, the launchpad's "Department
-- Agents" section keys on is_template = true rather than the
-- (created_by IS NULL AND is_template = false) compound predicate
-- introduced in Session 21. The flag becomes the canonical signal that
-- a row is a template — admin-editable, fork-as-personal-copy, surfaced
-- as a Department Agent on the launchpad.
--
-- Six Commercial rows were already is_template = true from migration
-- 0006 (rolled in alongside the Pattern B / D-025 architecture). This
-- migration extends the flip to every canonical row across all eight
-- departments. The predicate guards on `created_by IS NULL` so any
-- user-owned agent that somehow got is_template = false (the default)
-- remains untouched — only rows with no human owner become templates.
--
-- No DDL. No policy changes. The existing `agents_admin_write` RLS
-- policy on `public.agents` (migration 0001) already permits
-- super_admin / org_admin / dept_admin writes; service-role bypasses
-- RLS for migration application. Idempotent — re-running flips
-- nothing because the WHERE narrows to is_template = false.
-- ============================================================================

begin;

update public.agents
   set is_template = true
 where created_by is null
   and is_template = false;

commit;

-- ============================================================================
-- Reverse (do not run unless rolling back Session 27 launchpad activation;
-- the launchpad helper post-Session-27 keys on is_template = true and will
-- show an empty Department Agents section if these rows revert):
--
--   begin;
--     update public.agents
--        set is_template = false
--      where created_by is null
--        and is_template = true
--        and slug not in (
--          -- These six were template-flipped by migration 0006 and should
--          -- remain templates after a Session 27 rollback per Pattern B.
--          'enterprise-agreement-review',
--          'mutual-nda-review',
--          'order-form-sow-review',
--          'vendor-agreement-review',
--          'dpa-review',
--          'ai-addendum-review'
--        );
--   commit;
-- ============================================================================
