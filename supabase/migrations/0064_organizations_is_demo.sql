-- ============================================================================
-- 0064_organizations_is_demo.sql
-- Demo access Step 1 — mark an organization as a disposable demo sandbox
-- ============================================================================
--
-- Adds organizations.is_demo. This single boolean is the CORNERSTONE of demo
-- access safety:
--
--   * The real org(s) MUST be is_demo = false. The column defaults to false and
--     this migration sets it on NO existing row, so every current org — the
--     real "Your Company, Inc." included — stays false.
--   * ONLY the seeded Demo Org is ever flipped to true (by the operator-run
--     seed in supabase/seed/demo-org.sql, never by this migration).
--   * Step 2's reset script will REFUSE to operate on any org that is not
--     is_demo = true, so the flag is the guard that keeps a "reset the demo"
--     action from ever touching real data.
--
-- Additive and backward-compatible: nothing in the app reads is_demo yet, so
-- pre- and post-migration behavior is identical. The column rides the existing
-- organizations RLS unchanged — organizations_read_own (0001) returns the whole
-- row to a member, so is_demo is readable wherever an org row is read, and
-- writes stay super_admin-only via organizations_super_admin_write. RLS is
-- row-level, not column-level, so no policy change is needed or wanted.
--
-- DEPLOY ORDERING: apply this migration BEFORE running the demo-org seed (the
-- seed reads and writes is_demo). Apply in the Supabase SQL Editor, the
-- project's standard path.
-- ============================================================================

alter table public.organizations
  add column if not exists is_demo boolean not null default false;

comment on column public.organizations.is_demo is
  'True only for a disposable demo sandbox org (seeded by supabase/seed/demo-org.sql). Real orgs are always false. The Step-2 reset script keys its real-org safety guard on this flag: it refuses to operate on any org where is_demo is not true.';


-- ============================================================================
-- Done.
-- ============================================================================
-- Verification (run in the SQL Editor after applying):
--
--   -- Column present: boolean, NOT NULL, default false
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_name = 'organizations' and column_name = 'is_demo';
--   -- expect: is_demo, boolean, NO, false
--
--   -- No existing org was flipped — every org (incl. the real one) is false.
--   -- The real org "Your Company, Inc." (3cee4fe3-d5e3-4a81-a224-1acdae05d252)
--   -- must show is_demo = false here.
--   select id, name, is_demo from public.organizations order by created_at;
--   -- expect: every row is_demo = false (the Demo Org is created later, by the seed)
--
--   -- RLS unchanged (is_demo rides the existing organizations policies)
--   select polname from pg_policy
--   where polrelid = 'public.organizations'::regclass order by polname;
--   -- expect: organizations_read_own, organizations_super_admin_write
-- ============================================================================
--
-- Rollback (if ever needed):
--   alter table public.organizations drop column if exists is_demo;
-- ============================================================================
