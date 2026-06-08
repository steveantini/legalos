-- ============================================================================
-- 0066_org_scope_connections_and_policy.sql
-- Multi-tenant security fix — org-scope `connections` and `connection_policy`
-- ============================================================================
--
-- Two tables were built when there was only one organization and never carried
-- an organization_id. The live Demo Org (the first real second tenant) makes the
-- gap reachable:
--
--   * connection_policy was a global singleton (id integer primary key
--     check (id = 1)); any super_admin of any org (including a demo super_admin)
--     could rewrite the one row governing allowed_categories / allowed_providers /
--     default_capability_ceiling for EVERY org.
--   * connections has no organization_id; a scope='org' connection (owner_user_id
--     null) is bound to no specific org. The BYO model key (0051) rides this table
--     with a GLOBALLY-unique active-per-vendor index, and the chat-route resolver
--     reads it by vendor only (service-role, no org filter) — so one tenant's
--     saved key could route every org's inference (incl. real privileged work).
--
-- This migration gives both tables an organization_id, scopes their RLS to
-- current_org_id(), re-scopes the BYO unique index per-org, and backfills all
-- existing rows to the REAL org (the oldest is_demo = false org), whose behavior
-- is therefore unchanged. The companion code change scopes the service-role
-- reads (the resolver, the model/MCP state readers) and the policy read/write by
-- organization.
--
-- WHY NO INSERT-SITE CHANGES FOR connections: all three connection INSERTs (the
-- OAuth callback, the MCP callback, the BYO-model action) run through the
-- RLS-scoped server client. A BEFORE INSERT trigger fills organization_id from
-- current_org_id(), and the org-fenced WITH CHECK enforces it, so those flows
-- are correct without touching their (delicate, OAuth) code. The only connection
-- inserts are RLS-scoped; there is no service-role connection INSERT path.
--
-- DEPLOY ORDERING: apply this migration as close as possible to the companion
-- code deploy. The code is tolerant of the pre-migration schema (the BYO resolver
-- try/catches to the managed key; the policy read fails CLOSED, briefly denying
-- connections), so there is no data risk in either order — but apply promptly so
-- connection enforcement and BYO are not degraded longer than necessary. Apply in
-- the Supabase SQL Editor (the project's standard path).
-- ============================================================================


-- ============================================================================
-- PART A — connections.organization_id
-- ============================================================================

-- 1. Add the column (nullable for backfill), FK to organizations.
alter table public.connections
  add column organization_id uuid references public.organizations (id) on delete cascade;

-- 2. Backfill every existing connection to the real org (oldest is_demo = false).
--    The demo org has no connections yet, so this assigns all current rows to the
--    real org, preserving its behavior exactly.
update public.connections
   set organization_id = (
     select id from public.organizations
      where is_demo = false
      order by created_at asc
      limit 1
   )
 where organization_id is null;

-- 3. Lock it down: no connection may exist without an org.
alter table public.connections
  alter column organization_id set not null;

create index connections_organization_id_idx
  on public.connections (organization_id);

-- 4. Fill organization_id from the session on insert. Every connection INSERT
--    runs through the RLS-scoped server client, so current_org_id() is the
--    actor's org. SECURITY DEFINER + fixed search_path mirror the project's other
--    RLS helpers (0001). The org-fenced WITH CHECK below is the enforcement; this
--    trigger is the convenience that keeps the existing insert sites unchanged.
create or replace function public.set_connection_organization()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.organization_id is null then
    new.organization_id := public.current_org_id();
  end if;
  return new;
end;
$$;

drop trigger if exists connections_set_organization on public.connections;
create trigger connections_set_organization
  before insert on public.connections
  for each row execute function public.set_connection_organization();

-- 5. Re-scope the RLS policies: add the org fence to all three. This is the fix
--    for the cross-org write (a super_admin could write ANY org's connection) and
--    the cross-org governance read (super_admin saw every org's connections).
drop policy if exists connections_read_visible on public.connections;
create policy connections_read_visible
  on public.connections
  for select
  using (
    organization_id = public.current_org_id()
    and (
      owner_user_id = auth.uid()
      or public.has_connection_grant(id)
      or public.current_user_role() = 'super_admin'
    )
  );

drop policy if exists connections_personal_write on public.connections;
create policy connections_personal_write
  on public.connections
  for all
  using (
    scope = 'personal'
    and owner_user_id = auth.uid()
    and organization_id = public.current_org_id()
  )
  with check (
    scope = 'personal'
    and owner_user_id = auth.uid()
    and organization_id = public.current_org_id()
  );

drop policy if exists connections_org_super_admin_write on public.connections;
create policy connections_org_super_admin_write
  on public.connections
  for all
  using (
    scope = 'org'
    and public.current_user_role() = 'super_admin'
    and organization_id = public.current_org_id()
  )
  with check (
    scope = 'org'
    and public.current_user_role() = 'super_admin'
    and organization_id = public.current_org_id()
  );

-- 6. Re-scope the BYO-model unique index to PER-ORG: at most one active org model
--    connection per vendor PER ORGANIZATION (was globally unique). Each org may
--    have its own active BYO key for a vendor; no org's key collides with another.
drop index if exists connections_one_active_org_model_per_vendor;
create unique index connections_one_active_org_model_per_vendor
  on public.connections (organization_id, provider_id)
  where scope = 'org' and capability_category = 'models' and status = 'active';


-- ============================================================================
-- PART B — connection_policy: singleton → one row per org
-- ============================================================================

-- 1. Add the org column (nullable for backfill).
alter table public.connection_policy
  add column organization_id uuid references public.organizations (id) on delete cascade;

-- 2. Assign the existing global row to the real org (its values are preserved).
update public.connection_policy
   set organization_id = (
     select id from public.organizations
      where is_demo = false
      order by created_at asc
      limit 1
   )
 where organization_id is null;

-- 3. Drop the singleton id (drops its PK, the check (id = 1), and the default),
--    then make organization_id the primary key (one row per org).
alter table public.connection_policy drop column id;
alter table public.connection_policy alter column organization_id set not null;
alter table public.connection_policy add primary key (organization_id);

-- 4. Backfill a default policy row for every OTHER existing org (the Demo Org and
--    any future-at-migration-time org) that lacks one, using the seeded
--    permissive-but-safe defaults from 0044. No org silently inherits another
--    org's policy: the real org keeps its row; everyone else gets an explicit
--    default row.
insert into public.connection_policy
  (organization_id, allowed_categories, allowed_providers, default_capability_ceiling)
select
  o.id,
  array['file-storage', 'calendar', 'mail', 'messaging', 'matter-management']::text[],
  array['google-drive', 'google-calendar', 'gmail', 'slack']::text[],
  array['read']::text[]
from public.organizations o
where not exists (
  select 1 from public.connection_policy p where p.organization_id = o.id
);

-- 5. Re-scope RLS: read is now the caller's OWN org policy (was any authenticated
--    user, which is harmless but now correctly per-org); write is super_admin of
--    that same org only (was any super_admin → the cross-org tamper bug).
drop policy if exists connection_policy_read_authenticated on public.connection_policy;
create policy connection_policy_read_own_org
  on public.connection_policy
  for select
  using (organization_id = public.current_org_id());

drop policy if exists connection_policy_super_admin_write on public.connection_policy;
create policy connection_policy_super_admin_write
  on public.connection_policy
  for all
  using (
    public.current_user_role() = 'super_admin'
    and organization_id = public.current_org_id()
  )
  with check (
    public.current_user_role() = 'super_admin'
    and organization_id = public.current_org_id()
  );


-- ============================================================================
-- Done.
-- ============================================================================
-- Verification (run in the SQL Editor after applying):
--
--   -- No connection lacks an org; all existing connections are the real org's.
--   select count(*) as null_orgs from public.connections where organization_id is null;
--   -- expect: 0
--
--   -- The BYO unique index is now per-org (organization_id, provider_id).
--   select indexdef from pg_indexes
--   where indexname = 'connections_one_active_org_model_per_vendor';
--   -- expect: ... (organization_id, provider_id) WHERE ...
--
--   -- connection_policy is one row per org; the real org kept its values; the
--   -- demo org has a default row; no row lacks an org.
--   select o.name, o.is_demo, p.allowed_categories, p.default_capability_ceiling
--   from public.connection_policy p join public.organizations o on o.id = p.organization_id
--   order by o.created_at;
--   select count(*) as null_orgs from public.connection_policy where organization_id is null;
--   -- expect: 0; one row per org; real org's arrays unchanged from before.
--
--   -- Policies are org-scoped.
--   select polname from pg_policy where polrelid = 'public.connection_policy'::regclass order by polname;
--   -- expect: connection_policy_read_own_org, connection_policy_super_admin_write
--   select polname from pg_policy where polrelid = 'public.connections'::regclass order by polname;
--   -- expect: connections_org_super_admin_write, connections_personal_write, connections_read_visible
-- ============================================================================
