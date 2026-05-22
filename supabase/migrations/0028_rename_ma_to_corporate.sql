-- ============================================================================
-- legalOS
-- Migration 0028 — Rename the M&A department to Corporate
-- ============================================================================
--
-- Rename the legalOS department previously called "Mergers &
-- Acquisitions" (slug `ma`) to "Corporate" (slug `corporate`).
--
-- Rationale: "Corporate" is the canonical practice-area name in real
-- legal departments and law firms. M&A is one workstream within
-- Corporate (alongside financing, governance, securities, entity
-- management, joint ventures, etc.). The original legalOS taxonomy used
-- the narrower "M&A" framing; this migration aligns with industry
-- convention.
--
-- This also prepares the department to receive C4L's corporate-legal
-- plugin (which spans the full Corporate scope, not just M&A) without
-- creating a name/scope mismatch.
--
-- Both the display name and the slug change. Pre-launch is the right
-- time for slug churn — no bookmark cost, no external-reference cost.
-- Post-launch slug renames carry real friction.
--
-- Schema impact:
--   - `agents.department_id`, `user_department_roles.department_id`,
--     and any other FK reference uses the UUID, not the slug, so every
--     attached row continues to point at the same department row with
--     no further migration needed.
--   - The `unique (organization_id, slug)` constraint on departments
--     doesn't conflict — we're updating the existing row, not inserting
--     a new one.
--
-- Idempotent: `WHERE slug = 'ma'` returns zero rows once the rename has
-- applied. Re-running this migration is a no-op.
-- ============================================================================

begin;

update public.departments
   set name       = 'Corporate',
       slug       = 'corporate',
       updated_at = now()
 where slug = 'ma';

commit;

-- ============================================================================
-- Reverse (do not run unless rolling back the rename):
--
-- begin;
-- update public.departments
--    set name       = 'Mergers & Acquisitions',
--        slug       = 'ma',
--        updated_at = now()
--  where slug = 'corporate';
-- commit;
-- ============================================================================
