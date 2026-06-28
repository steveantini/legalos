-- ============================================================================
-- 0044_connection_data_model.sql
-- Connector hub arc, Milestone 3 — the connection data model (the C-model)
-- ============================================================================
--
-- Three tables: connections (the provider link), connection_grants (who can
-- use a connection and with what capabilities), and connection_policy (a
-- super-admin-governed singleton). Row-level security on all three, matching
-- the patterns in 0001_initial_schema.sql (security-definer helper functions,
-- current_user_role() for role checks).
--
-- No OAuth and no tokens in this milestone: token_ref stays null. No rows are
-- created here except the default policy row, so connection-state reads return
-- empty (the home gates and the Connections page render unchanged). OAuth in a
-- later milestone populates connections + grants, flipping the dormant UI live.
--
-- Apply in the Supabase SQL Editor (the project's standard migration path).
-- ============================================================================


-- ============================================================================
-- Table: connections
-- ============================================================================
-- The provider link. One row per connected provider account. Personal
-- connections are owned by a user; org connections are owned by the
-- organization (owner_user_id null) and shared via grants.

create table public.connections (
  id                      uuid primary key default gen_random_uuid(),
  provider_id             text not null,         -- e.g. 'google-drive' (matches connections-data.ts ids)
  capability_category     text not null,         -- e.g. 'file-storage' (matches connections-data.ts group ids)
  scope                   text not null check (scope in ('personal', 'org')),
  owner_user_id           uuid references auth.users (id) on delete cascade,  -- set for personal; null for org
  created_by_user_id      uuid references auth.users (id) on delete set null, -- audit; nullable so deprovisioning a creator doesn't block (mirrors agents.created_by)
  token_ref               text,                  -- reference to the encrypted token, NEVER the token (see comment below)
  status                  text not null default 'active' check (status in ('active', 'revoked', 'error')),
  provider_account_label  text,                  -- display label for the connected account (e.g. the email); set at OAuth time
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on column public.connections.token_ref is
  'Reference to where the encrypted OAuth token lives (e.g. a Supabase Vault secret key), NEVER the raw token. Null until OAuth ships in a later milestone; the raw token never lives in this table.';
comment on column public.connections.owner_user_id is
  'Owner of a personal connection; null for org connections. on delete cascade is the SSO-deprovisioning foundation: deleting the user removes their personal connections.';

create index connections_owner_user_id_idx on public.connections (owner_user_id);
create index connections_scope_category_idx on public.connections (scope, capability_category);

create trigger connections_updated_at
  before update on public.connections
  for each row execute function public.set_updated_at();

alter table public.connections enable row level security;


-- ============================================================================
-- Table: connection_grants
-- ============================================================================
-- Who can use a connection and with what capabilities. For a personal
-- connection, one grant row for the owner. For an org connection, one row per
-- granted user. Capabilities live in an extensible-but-validated array.

create table public.connection_grants (
  id                   uuid primary key default gen_random_uuid(),
  connection_id        uuid not null references public.connections (id) on delete cascade,
  grantee_user_id      uuid not null references auth.users (id) on delete cascade,  -- the SSO-deprovisioning cascade: deleting a user removes their grants
  capabilities         text[] not null default '{}' check (capabilities <@ array['read', 'write']::text[]),
  granted_by_user_id   uuid references auth.users (id) on delete set null,  -- audit; nullable (see connections.created_by_user_id)
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (connection_id, grantee_user_id)
);

comment on column public.connection_grants.capabilities is
  'Extensible validated capability set. Allowed values today: read, write. To add an automation capability later (trigger, route, notify, ...), alter the CHECK constraint to include it (a small constraint migration, no data migration). The array is the per-user capability set; one grant row per (connection, user).';
comment on column public.connection_grants.grantee_user_id is
  'The user who can use the connection. grantee_user_id IS the SSO-resolved identity (auth.users is populated by the SSO/OIDC flow), so a separate sso_identity_ref column is intentionally omitted; the on delete cascade here is the deprovisioning mechanism.';

create index connection_grants_grantee_user_id_idx on public.connection_grants (grantee_user_id);

create trigger connection_grants_updated_at
  before update on public.connection_grants
  for each row execute function public.set_updated_at();

alter table public.connection_grants enable row level security;


-- ============================================================================
-- Table: connection_policy
-- ============================================================================
-- Super-admin governance: what is permitted org-wide. Single-org product for
-- now, so a singleton row (id is fixed at 1). A later milestone builds the
-- admin UI that edits this; for now a seeded permissive-but-safe default.

create table public.connection_policy (
  id                          integer primary key default 1 check (id = 1),  -- singleton guard
  allowed_categories          text[] not null default array['file-storage', 'calendar', 'mail', 'messaging', 'matter-management']::text[],
  allowed_providers           text[] not null default array['google-drive', 'google-calendar', 'gmail', 'slack']::text[],
  default_capability_ceiling  text[] not null default array['read']::text[] check (default_capability_ceiling <@ array['read', 'write']::text[]),
  updated_by_user_id          uuid references auth.users (id) on delete set null,
  updated_at                  timestamptz not null default now()
);

comment on column public.connection_policy.default_capability_ceiling is
  'Maximum capabilities a user can self-grant without admin approval. Default read-only; write requires an admin grant. Enforced at the application layer in a later milestone; this column is the source of truth.';

create trigger connection_policy_updated_at
  before update on public.connection_policy
  for each row execute function public.set_updated_at();

alter table public.connection_policy enable row level security;


-- ============================================================================
-- Helper functions for connection RLS
-- ============================================================================
-- security definer so cross-table checks bypass RLS and do not recurse with
-- the connections / connection_grants policies (mirrors has_department_access
-- in 0001_initial_schema.sql). Defined after the tables they read.

-- True if the current user owns the given connection (personal connections
-- only; org connections have a null owner).
create or replace function public.owns_connection(conn_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.connections
    where id = conn_id and owner_user_id = auth.uid()
  );
$$;

-- True if the current user has a grant for the given connection.
create or replace function public.has_connection_grant(conn_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.connection_grants
    where connection_id = conn_id and grantee_user_id = auth.uid()
  );
$$;


-- ============================================================================
-- RLS Policies: connections
-- ============================================================================
-- SELECT: own personal connection, OR an org connection you are granted, OR
-- super admin (governance read-all). Write: owner for personal; super admin
-- for org.

create policy connections_read_visible
  on public.connections
  for select
  using (
    owner_user_id = auth.uid()
    or public.has_connection_grant(id)
    or public.current_user_role() = 'super_admin'
  );

create policy connections_personal_write
  on public.connections
  for all
  using (scope = 'personal' and owner_user_id = auth.uid())
  with check (scope = 'personal' and owner_user_id = auth.uid());

create policy connections_org_super_admin_write
  on public.connections
  for all
  using (scope = 'org' and public.current_user_role() = 'super_admin')
  with check (scope = 'org' and public.current_user_role() = 'super_admin');


-- ============================================================================
-- RLS Policies: connection_grants
-- ============================================================================
-- SELECT: you are the grantee, OR you own the connection, OR super admin.
-- Write: owner of a (personal) connection manages its grants; super admin
-- manages org-connection grants (and any).

create policy connection_grants_read_visible
  on public.connection_grants
  for select
  using (
    grantee_user_id = auth.uid()
    or public.owns_connection(connection_id)
    or public.current_user_role() = 'super_admin'
  );

create policy connection_grants_owner_write
  on public.connection_grants
  for all
  using (public.owns_connection(connection_id))
  with check (public.owns_connection(connection_id));

create policy connection_grants_super_admin_write
  on public.connection_grants
  for all
  using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');


-- ============================================================================
-- RLS Policies: connection_policy
-- ============================================================================
-- SELECT: any authenticated user (they read policy to know what they can
-- connect). Write: super admin only.

create policy connection_policy_read_authenticated
  on public.connection_policy
  for select
  using (auth.uid() is not null);

create policy connection_policy_super_admin_write
  on public.connection_policy
  for all
  using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');


-- ============================================================================
-- Seed: default policy row (permissive but safe)
-- ============================================================================
-- All current categories and available providers allowed; read-only ceiling.
-- Idempotent via the singleton id and on-conflict-do-nothing. Guarded on an
-- org existing: on a from-empty replay (fresh branch / local reset / DR rebuild)
-- no organization exists yet, so no row is seeded and 0066's later
-- `set not null` on connection_policy.organization_id has nothing to violate.
-- When 0044 was applied to production an org already existed, so the row was
-- seeded exactly as before (prod end-state byte-identical). An org created
-- later with no policy row behaves identically via PERMISSIVE_DEFAULT_POLICY
-- (lib/connections/policy.ts). 0066 stays untouched. See D-217.
insert into public.connection_policy (id)
select 1 where exists (select 1 from public.organizations)
on conflict (id) do nothing;


-- ============================================================================
-- Done.
-- ============================================================================
