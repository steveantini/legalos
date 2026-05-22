-- ============================================================================
-- legalOS
-- Migration 0029 — Update Corporate department's description
-- ============================================================================
--
-- Aligns the Corporate department's description with its broader
-- post-rename scope. Migration 0028 renamed M&A → Corporate but was
-- intentionally scoped to name + slug only; this migration completes
-- the rename by updating the description to match the full practice
-- area (mergers + financing + governance + securities + entity
-- management — not just M&A deals).
--
-- The companion update to `supabase/seed/0001_org_and_departments.sql`
-- lands alongside this migration so a fresh seed reproduces the
-- post-migration state. The seed's ON CONFLICT clause includes
-- `description = excluded.description`, so re-seeding against an
-- already-migrated DB also keeps the description in sync.
--
-- Idempotent in practice: re-running this migration just rewrites the
-- same description with a fresh `updated_at`. No structural change.
-- ============================================================================

begin;

update public.departments
   set description = 'Mergers, financing, governance, securities, and entity management.',
       updated_at = now()
 where slug = 'corporate';

commit;

-- ============================================================================
-- Reverse (do not run unless rolling back the description update):
--
-- begin;
-- update public.departments
--    set description = 'Deal diligence, merger agreements, integration planning.',
--        updated_at = now()
--  where slug = 'corporate';
-- commit;
-- ============================================================================
