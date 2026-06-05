-- ============================================================================
-- 0058_platform_admins.sql
-- C4L content library + platform-owner tier, Step 1 — the platform_owner grant
-- ============================================================================
--
-- Introduces a CROSS-TENANT platform-owner capability for legalOS-the-vendor,
-- modeled as a SEPARATE AXIS from the org user_role enum ('super_admin',
-- 'org_admin', 'user'). A platform owner is NOT "a higher org role" — it is a
-- different kind of authority (administering the platform across tenants), so it
-- is a standalone grant, not a rung in the org hierarchy. This keeps the model
-- honest as the schema becomes truly multi-tenant and lets one person hold both
-- an org role (super_admin in their org) AND the platform capability.
--
-- The grant is DATA, not hardcoded logic, so it is reassignable later (e.g. to a
-- future steve@legalos.com) and grantable to future platform engineers.
--
-- NOT SELF-GRANTABLE (security-critical): RLS is enabled with ONLY a read-own
-- SELECT policy and NO insert/update/delete policy, so the authenticated role
-- can never write this table. The grant is settable only by the service role
-- (this migration, or a future platform-owner-only action that uses the admin
-- client). A user can read whether THEY hold the grant, never grant it.
--
-- DEPLOY ORDERING: code is tolerant of this table being absent — the
-- platform-owner reader treats a missing table / no row as "not a platform
-- owner", so the platform surface simply 404s for everyone until this is applied
-- and the grant lands. The rest of the app is unaffected either way. Apply in the
-- Supabase SQL Editor (the project's standard migration path).
-- ============================================================================


-- ============================================================================
-- Table: platform_admins
-- ============================================================================
-- One row per account holding the cross-tenant platform-owner capability.

create table public.platform_admins (
  -- References auth.users directly (NOT public.users): platform identity is
  -- above the org boundary, not org-scoped. 1:1 with the auth account.
  user_id      uuid primary key references auth.users (id) on delete cascade,
  -- Audit: who granted it (a service-role/migration grant leaves this null).
  granted_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.platform_admins is
  'Cross-tenant platform-owner grant for legalOS-the-vendor. A SEPARATE AXIS from the org user_role enum, not a higher org role. Settable only by the service role (migration or a future platform-owner-only action); NEVER self-grantable (RLS has no write policy). Reassignable: delete + insert to move it.';

create trigger platform_admins_updated_at
  before update on public.platform_admins
  for each row execute function public.set_updated_at();

alter table public.platform_admins enable row level security;


-- ============================================================================
-- RLS Policies: platform_admins
-- ============================================================================
-- READ-OWN ONLY: a user may check whether THEY hold the grant (the gating helper
-- reads this), and nothing else. There is intentionally NO insert/update/delete
-- policy, so RLS denies every write from the authenticated role — the grant can
-- never be self-assigned. The service role bypasses RLS for the migration grant.

create policy platform_admins_read_own
  on public.platform_admins
  for select
  using (user_id = auth.uid());


-- ============================================================================
-- Grant: the operator's existing account (data, not hardcoded logic)
-- ============================================================================
-- Looks the user up by email so the grant is reassignable (move it by editing
-- this data, not code). Idempotent via ON CONFLICT. If the email does not match a
-- user row, this inserts nothing — set it manually in the SQL Editor instead:
--   insert into public.platform_admins (user_id)
--   select id from public.users where email = '<the-platform-owner-email>'
--   on conflict (user_id) do nothing;

insert into public.platform_admins (user_id)
select id from public.users
where email = 'steve@antinilaw.com'
on conflict (user_id) do nothing;


-- ============================================================================
-- Done.
-- ============================================================================
-- Verification (run in the SQL Editor after applying):
--
--   -- table + RLS present
--   select relname, relrowsecurity from pg_class where relname = 'platform_admins';
--   -- expect: relrowsecurity = true
--
--   -- ONLY a read-own SELECT policy, no write policies (not self-grantable)
--   select polname, polcmd from pg_policy
--   where polrelid = 'public.platform_admins'::regclass order by polname;
--   -- expect exactly one row: platform_admins_read_own, polcmd = 'r' (SELECT)
--
--   -- the operator's grant landed
--   select u.email, pa.created_at
--   from public.platform_admins pa join public.users u on u.id = pa.user_id;
--   -- expect: steve@antinilaw.com
-- ============================================================================
