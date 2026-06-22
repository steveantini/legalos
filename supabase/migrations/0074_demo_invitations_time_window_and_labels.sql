-- ============================================================================
-- 0074_demo_invitations_time_window_and_labels.sql
-- Demo access Step 3 — labels + the shift to time-window links
-- ============================================================================
--
-- Extends demo_invitations (0065) for the platform-owner demo-access surface
-- (D-166), which replaces script-only minting and changes the link model from
-- single-use to a time window:
--
--   1. label — a nullable free-text note the platform owner fills in at mint
--      ("Acme Corp – GC", "Jane at Beta"), so the invitation list doubles as a
--      record of WHO has demo access. Never rendered as markup; a label, not
--      content.
--
--   2. last_accessed_at — a nullable timestamptz stamped on every successful
--      /demo visit, so the list can show whether (and when) a link was opened
--      without a separate access-log table.
--
--   3. status now allows 'active' (the steady state of a time-window link) in
--      addition to the legacy 'pending'/'consumed'/'revoked'. Validity is no
--      longer "flip pending→consumed on first click"; it is "not revoked AND
--      now() < expires_at", evaluated repeatedly. Legacy values stay VALID in
--      the check so the one previously-minted token keeps working (it simply
--      behaves as a time-window link now). New mints write 'active'.
--
-- The token→user binding reuses the existing consumed_by_user_id column: the
-- synthetic user a token first mints is recorded there and REUSED on later
-- visits, so a returning prospect lands back in their own session. Its FK is
-- ON DELETE SET NULL, so a hard reset (which deletes demo users) nulls it and
-- the next visit provisions a fresh user — no dangling reference.
--
-- The platform surface reads/writes these rows with the SERVICE-ROLE client
-- behind requirePlatformOwner() (the cross-org operator_* analytics precedent,
-- 0067), because the platform owner is not a member of the demo org; the
-- existing org-admin RLS policies are unchanged and still govern any in-app
-- org-scoped access.
--
-- IDEMPOTENT throughout (ADD COLUMN IF NOT EXISTS / DROP … IF EXISTS before
-- recreate), so a partially applied earlier attempt does not block a rerun:
-- apply the whole file again and it converges.
--
-- DEPLOY ORDERING: requires 0065 (demo_invitations). Apply in the Supabase SQL
-- Editor (the project's standard path).
-- ============================================================================


-- ============================================================================
-- PART 1 — New columns (idempotent, nullable, no backfill)
-- ============================================================================

alter table public.demo_invitations
  add column if not exists label text;

alter table public.demo_invitations
  add column if not exists last_accessed_at timestamptz;

comment on column public.demo_invitations.label is
  'Free-text record-keeping note set by the platform owner at mint (who the link is for). Nullable; never rendered as markup.';
comment on column public.demo_invitations.last_accessed_at is
  'Most recent successful /demo visit on this token. Null until first opened.';
comment on column public.demo_invitations.consumed_by_user_id is
  'The synthetic demo user this token is bound to. Under the time-window model (D-166) it is REUSED across visits so a returning prospect maps back to the same user. ON DELETE SET NULL: a hard reset nulls it and the next visit provisions afresh.';


-- ============================================================================
-- PART 2 — Status: allow 'active' (steady state of a time-window link)
-- ============================================================================
-- Keep the legacy values valid so the previously-minted token (status
-- 'pending'/'consumed') still validates. New mints write 'active'.

alter table public.demo_invitations
  drop constraint if exists demo_invitations_status_check;
alter table public.demo_invitations
  add constraint demo_invitations_status_check
  check (status in ('active', 'pending', 'consumed', 'revoked'));

alter table public.demo_invitations
  alter column status set default 'active';


-- ============================================================================
-- PART 3 — updated_at trigger (idempotent: drop then recreate)
-- ============================================================================

drop trigger if exists demo_invitations_updated_at on public.demo_invitations;
create trigger demo_invitations_updated_at
  before update on public.demo_invitations
  for each row execute function public.set_updated_at();


-- ============================================================================
-- Done.
-- ============================================================================
-- Verification (run in the SQL Editor after applying):
--
--   -- 1. New columns present and nullable.
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'demo_invitations'
--     and column_name in ('label', 'last_accessed_at')
--   order by column_name;
--   -- expect: 2 rows, both is_nullable = YES.
--
--   -- 2. Status check allows 'active' (and the legacy values).
--   select pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.demo_invitations'::regclass
--     and conname = 'demo_invitations_status_check';
--   -- expect: CHECK (status IN ('active','pending','consumed','revoked'))
--
--   -- 3. Default status is now 'active'.
--   select column_default from information_schema.columns
--   where table_name = 'demo_invitations' and column_name = 'status';
--   -- expect: 'active'::text
--
--   -- 4. updated_at trigger still present.
--   select tgname from pg_trigger
--   where tgrelid = 'public.demo_invitations'::regclass
--     and tgname = 'demo_invitations_updated_at';
--   -- expect: 1 row.
-- ============================================================================
