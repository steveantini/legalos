-- ============================================================================
-- 0059_content_provider_settings.sql
-- C4L content library + platform-owner tier, Step 5 (FINAL) — super-admin
-- org-level governance of vendor content + last-updated transparency
-- ============================================================================
--
-- The two-layer governance the arc built toward: the PLATFORM OWNER controls
-- what the curated content IS (connect / refresh / versions — Steps 1-4); the
-- SUPER ADMIN controls whether their ORG uses/sees it (this step).
--
-- STORAGE CHOICE: a dedicated per-(org, provider) table, NOT the connection
-- policy's `allowed_categories` permit-list. A permit-list defaults to
-- DENY-when-absent, which is incompatible with vendor content's required default
-- (PERMITTED, shown until explicitly denied) — adding it there would either hide
-- content pre-seed or make an explicit deny impossible. A per-provider row with
-- `enabled` default TRUE expresses default-permit + explicit-deny cleanly, and is
-- the multi-provider-ready store the locked C4L-placement decision called for
-- (the launchpad is vendor-agnostic as of Step 4). Same table carries the
-- last-updated timestamp the platform-owner refresh writes and super admins read.
--
-- DEFAULT-PERMIT + DEPLOY ORDERING: `enabled` defaults TRUE, and the application
-- treats a MISSING ROW (and a missing table, pre-migration) as ENABLED. So vendor
-- content shows by default and stays shown until a super admin explicitly turns a
-- provider off (which writes a row with enabled=false). No seed row is needed.
-- The code is tolerant: before this migration is applied, the settings read fails
-- closed to "all enabled", so the launchpad is unchanged. Apply in the Supabase
-- SQL Editor (the project's standard migration path).
-- ============================================================================


-- ============================================================================
-- Table: content_provider_settings
-- ============================================================================
-- One row per (organization, vendor content provider). Absence of a row means
-- the org's default: the provider is ENABLED and has never been refreshed.

create table public.content_provider_settings (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  -- The vendor content provider id (the source_origin prefix), e.g.
  -- 'claude-for-legal'. Matches lib/content/vendor-registry.ts.
  provider_id        text not null,
  -- Whether this provider's curated agents are shown to the org. DEFAULT TRUE
  -- (vendor content is a default-on value-add); a super admin sets it false to
  -- hide the provider's sections org-wide.
  enabled            boolean not null default true,
  -- When the platform owner last successfully refreshed this provider's content
  -- (written by the refresh action; read by super admins for transparency). Null
  -- until the first refresh.
  last_refreshed_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, provider_id)
);

comment on table public.content_provider_settings is
  'Per-org enablement + last-refreshed state for vendor content providers (C4L arc Step 5). A missing row means the org default: enabled, never refreshed. enabled=false hides that provider''s curated agents org-wide. Settable by super admins (RLS); last_refreshed_at written service-side by the platform-owner refresh.';

create index content_provider_settings_org_idx
  on public.content_provider_settings (organization_id);

create trigger content_provider_settings_updated_at
  before update on public.content_provider_settings
  for each row execute function public.set_updated_at();

alter table public.content_provider_settings enable row level security;


-- ============================================================================
-- RLS Policies: content_provider_settings
-- ============================================================================
-- READ: any authenticated member of the org may read it — the launchpad needs
-- the enablement state to decide whether to show vendor sections (it is not
-- sensitive, just "is this curated library on"). WRITE: super admins only
-- (mirrors the connection-policy write gate). The platform-owner refresh writes
-- last_refreshed_at via the service role, which bypasses RLS.

create policy content_provider_settings_read_org
  on public.content_provider_settings
  for select
  using (organization_id = public.current_org_id());

create policy content_provider_settings_super_admin_write
  on public.content_provider_settings
  for all
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() = 'super_admin'
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_user_role() = 'super_admin'
  );


-- ============================================================================
-- Done.
-- ============================================================================
-- Verification (run in the SQL Editor after applying):
--
--   -- table + RLS present
--   select relname, relrowsecurity from pg_class where relname = 'content_provider_settings';
--   -- expect: relrowsecurity = true
--
--   -- policies present (read-org + super-admin write)
--   select polname, polcmd from pg_policy
--   where polrelid = 'public.content_provider_settings'::regclass order by polname;
--   -- expect: content_provider_settings_read_org (r), content_provider_settings_super_admin_write (*)
--
--   -- default-permit: no rows exist, yet the app treats every provider as enabled.
--   select count(*) from public.content_provider_settings;  -- expect 0 (until a toggle/refresh writes one)
-- ============================================================================
