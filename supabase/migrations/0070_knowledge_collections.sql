-- ============================================================================
-- 0070_knowledge_collections.sql
-- Knowledge arc Step 1 — collections: transparent scopes over connected
-- repositories
-- ============================================================================
--
-- A collection is a named, governed scope an administrator draws over the
-- repositories the organization already uses ("Commercial contracts = this
-- Drive folder + this Box space"), referenced by STABLE folder id through the
-- org's MCP connections, never by path. legalOS is the intelligence layer over
-- those repositories: the only thing persisted here is a document INVENTORY
-- (titles and metadata captured by an admin-clicked sync), never document
-- content, so knowledge genuinely stays where it lives.
--
-- Four tables:
--   * collections            — the scope: name, description, visibility.
--   * collection_departments — which departments see a 'departments' collection.
--   * collection_sources     — connection + stable folder reference + cached
--                              display provenance ("Google Drive / Legal / ...").
--   * collection_documents   — the inventory (metadata only; no content).
--
-- GOVERNANCE (the established double-gate): super admins write (the server
-- actions check isCurrentUserSuperAdmin(); these policies re-enforce at the
-- DB). Org members read within the org fence, with 'departments' visibility
-- enforced IN RLS, so a department-scoped collection is invisible to outsiders
-- at the database layer, not merely hidden in the UI. Child tables are fenced
-- through their parent collection: their read policies subquery
-- public.collections, which runs under the caller's RLS, so a child row is
-- readable exactly when its collection is.
--
-- STATEMENT ORDER MATTERS: all tables first, then the helper function, then
-- the policies. `language sql` function bodies are validated at creation
-- (check_function_bodies is on in Supabase), so the visibility helper cannot
-- be created before the table it queries exists — the original ordering
-- failed exactly there.
--
-- IDEMPOTENT throughout (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF
-- EXISTS), so a partially applied earlier attempt does not block a rerun:
-- apply the whole file again and it converges.
--
-- Apply in the Supabase SQL Editor (the project's standard path).
-- ============================================================================


-- ============================================================================
-- PART 1 — Tables (all of them, before anything that references them)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table: collections
-- ----------------------------------------------------------------------------

create table if not exists public.collections (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  name               text not null,
  description        text not null default '',
  -- 'org' = every org member sees it; 'departments' = only members of the
  -- departments listed in collection_departments (admins always see all).
  visibility         text not null default 'org' check (visibility in ('org', 'departments')),
  created_by_user_id uuid references public.users (id) on delete set null,
  -- Set when a full sync (every source walked to completion) finishes.
  last_synced_at     timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists collections_organization_id_idx
  on public.collections (organization_id);

drop trigger if exists collections_updated_at on public.collections;
create trigger collections_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

alter table public.collections enable row level security;

-- ----------------------------------------------------------------------------
-- Table: collection_departments
-- ----------------------------------------------------------------------------
-- Which departments a 'departments'-visibility collection is visible to.
-- Composite primary key; rows exist only for that visibility mode.

create table if not exists public.collection_departments (
  collection_id uuid not null references public.collections (id) on delete cascade,
  department_id uuid not null references public.departments (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (collection_id, department_id)
);

create index if not exists collection_departments_department_id_idx
  on public.collection_departments (department_id);

alter table public.collection_departments enable row level security;

-- ----------------------------------------------------------------------------
-- Table: collection_sources
-- ----------------------------------------------------------------------------
-- One repository folder backing a collection. References the live MCP
-- connection row (so D-136 org-scoping and honest disable-on-disconnect come
-- free) plus the STABLE folder id; display_path is cached provenance,
-- recomputed at sync, never the reference itself.

create table if not exists public.collection_sources (
  id             uuid primary key default gen_random_uuid(),
  collection_id  uuid not null references public.collections (id) on delete cascade,
  -- on delete restrict: a connection with collection sources should be
  -- disconnected deliberately; the UI shows such sources as disabled rather
  -- than silently losing them. (Disconnect today flips connections.status;
  -- rows are not deleted, so this restriction is a backstop.)
  connection_id  uuid not null references public.connections (id) on delete restrict,
  -- The repository's stable folder identifier (Drive folderId, Box folder id).
  root_reference text not null,
  -- Cached human provenance, e.g. 'Google Drive / Legal / Playbooks'.
  display_path   text not null,
  recursive      boolean not null default true,
  last_synced_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists collection_sources_collection_id_idx
  on public.collection_sources (collection_id);
create index if not exists collection_sources_connection_id_idx
  on public.collection_sources (connection_id);

drop trigger if exists collection_sources_updated_at on public.collection_sources;
create trigger collection_sources_updated_at
  before update on public.collection_sources
  for each row execute function public.set_updated_at();

alter table public.collection_sources enable row level security;

-- ----------------------------------------------------------------------------
-- Table: collection_documents
-- ----------------------------------------------------------------------------
-- The inventory: one row per document the sync enumerated. METADATA ONLY —
-- titles, types, sizes, timestamps, links. Document content is never stored.
-- A document that disappears upstream flips to status 'missing' (never a
-- silent drop); last_seen_at is the sync-pass watermark that drives it.

create table if not exists public.collection_documents (
  id                   uuid primary key default gen_random_uuid(),
  collection_id        uuid not null references public.collections (id) on delete cascade,
  collection_source_id uuid not null references public.collection_sources (id) on delete cascade,
  -- The repository's stable document id.
  external_id          text not null,
  title                text not null default '',
  mime_type            text not null default '',
  size_bytes           bigint,
  modified_at_source   timestamptz,
  source_url           text,
  last_seen_at         timestamptz not null default now(),
  status               text not null default 'present' check (status in ('present', 'missing')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- One inventory row per document per source; the sync upserts on this.
create unique index if not exists collection_documents_source_external_idx
  on public.collection_documents (collection_source_id, external_id);

create index if not exists collection_documents_collection_id_idx
  on public.collection_documents (collection_id);

drop trigger if exists collection_documents_updated_at on public.collection_documents;
create trigger collection_documents_updated_at
  before update on public.collection_documents
  for each row execute function public.set_updated_at();

alter table public.collection_documents enable row level security;


-- ============================================================================
-- PART 2 — Helper: department-visibility membership (security definer)
-- ============================================================================
-- True when the current user belongs to any department a collection is scoped
-- to. SECURITY DEFINER on purpose: the collections read policy calls this, and
-- collection_departments' own read policy subqueries collections — if the
-- collections policy read collection_departments directly under caller RLS,
-- the two policies would form a cycle and Postgres would reject every read
-- with "infinite recursion detected in policy". A security-definer SQL
-- function is not inlined into the policy plan and reads the membership table
-- without RLS, breaking the cycle (the same pattern as current_org_id() and
-- has_department_access()). Created AFTER the tables because the SQL body is
-- validated at creation time.

create or replace function public.user_in_collection_departments(coll_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.collection_departments cd
      join public.user_department_roles udr
        on udr.department_id = cd.department_id
     where cd.collection_id = coll_id
       and udr.user_id = auth.uid()
  );
$$;


-- ============================================================================
-- PART 3 — RLS policies (after every table and the helper they reference)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- collections
-- ----------------------------------------------------------------------------

-- Read: own-org rows, where the collection is org-visible, the reader is an
-- org/super admin, or the reader belongs to one of its departments (checked
-- via the security-definer helper above — see its comment for why it must not
-- be a direct subquery on collection_departments).
drop policy if exists collections_read_visible_in_org on public.collections;
create policy collections_read_visible_in_org
  on public.collections
  for select
  using (
    organization_id = public.current_org_id()
    and (
      visibility = 'org'
      or public.current_user_role() in ('super_admin', 'org_admin')
      or public.user_in_collection_departments(id)
    )
  );

-- Write: super admins only, inside their own org.
drop policy if exists collections_super_admin_write on public.collections;
create policy collections_super_admin_write
  on public.collections
  for all
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() = 'super_admin'
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_user_role() = 'super_admin'
  );

-- ----------------------------------------------------------------------------
-- collection_departments
-- ----------------------------------------------------------------------------

-- Read: admins see all rows of their org's collections; members see the rows
-- for departments they belong to (enough to render "visible to" honestly).
-- The subquery on collections is safe in THIS direction: the collections read
-- policy reaches department membership only through the security-definer
-- helper, never through this table directly, so no policy cycle forms.
drop policy if exists collection_departments_read on public.collection_departments;
create policy collection_departments_read
  on public.collection_departments
  for select
  using (
    exists (
      select 1
        from public.collections c
       where c.id = collection_id
         and c.organization_id = public.current_org_id()
    )
    and (
      public.current_user_role() in ('super_admin', 'org_admin')
      or public.has_department_access(department_id)
    )
  );

drop policy if exists collection_departments_super_admin_write on public.collection_departments;
create policy collection_departments_super_admin_write
  on public.collection_departments
  for all
  using (
    public.current_user_role() = 'super_admin'
    and exists (
      select 1
        from public.collections c
       where c.id = collection_id
         and c.organization_id = public.current_org_id()
    )
  )
  with check (
    public.current_user_role() = 'super_admin'
    and exists (
      select 1
        from public.collections c
       where c.id = collection_id
         and c.organization_id = public.current_org_id()
    )
  );

-- ----------------------------------------------------------------------------
-- collection_sources
-- ----------------------------------------------------------------------------

-- Read: whoever can read the parent collection (the subquery runs under the
-- caller's RLS on collections, so visibility composes exactly).
drop policy if exists collection_sources_read_via_collection on public.collection_sources;
create policy collection_sources_read_via_collection
  on public.collection_sources
  for select
  using (
    exists (
      select 1 from public.collections c where c.id = collection_id
    )
  );

drop policy if exists collection_sources_super_admin_write on public.collection_sources;
create policy collection_sources_super_admin_write
  on public.collection_sources
  for all
  using (
    public.current_user_role() = 'super_admin'
    and exists (
      select 1
        from public.collections c
       where c.id = collection_id
         and c.organization_id = public.current_org_id()
    )
  )
  with check (
    public.current_user_role() = 'super_admin'
    and exists (
      select 1
        from public.collections c
       where c.id = collection_id
         and c.organization_id = public.current_org_id()
    )
  );

-- ----------------------------------------------------------------------------
-- collection_documents
-- ----------------------------------------------------------------------------

drop policy if exists collection_documents_read_via_collection on public.collection_documents;
create policy collection_documents_read_via_collection
  on public.collection_documents
  for select
  using (
    exists (
      select 1 from public.collections c where c.id = collection_id
    )
  );

drop policy if exists collection_documents_super_admin_write on public.collection_documents;
create policy collection_documents_super_admin_write
  on public.collection_documents
  for all
  using (
    public.current_user_role() = 'super_admin'
    and exists (
      select 1
        from public.collections c
       where c.id = collection_id
         and c.organization_id = public.current_org_id()
    )
  )
  with check (
    public.current_user_role() = 'super_admin'
    and exists (
      select 1
        from public.collections c
       where c.id = collection_id
         and c.organization_id = public.current_org_id()
    )
  );


-- ============================================================================
-- Verification (run after applying)
-- ============================================================================
-- 1. Tables exist with RLS enabled:
--    select tablename, rowsecurity from pg_tables
--     where schemaname = 'public'
--       and tablename in ('collections', 'collection_departments',
--                         'collection_sources', 'collection_documents');
--    -- expect: 4 rows, rowsecurity = true on all.
--
-- 2. Policies present:
--    select tablename, policyname from pg_policies
--     where tablename like 'collection%' order by tablename, policyname;
--    -- expect: a read and a super_admin write policy per table.
--
-- 3. The helper exists:
--    select proname from pg_proc
--     where proname = 'user_in_collection_departments';
--
-- 4. The inventory upsert key exists:
--    select indexname from pg_indexes
--     where tablename = 'collection_documents'
--       and indexname = 'collection_documents_source_external_idx';
