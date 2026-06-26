-- ============================================================================
-- 20260626120000_add_collection_schema_definitions.sql
-- Structured Query (phase one), commit 2 — the schema DEFINITION.
-- ============================================================================
--
-- WHY. Commit 1 gave every document a canonical anchor. This commit lets an
-- admin DEFINE what to extract from a collection's documents: a versioned set
-- of attributes (name + type + plain-language description). Nothing is
-- extracted yet (commit 3); this is storage + the admin builder only.
--
-- HOUSE PATTERN. User-defined-schema data follows the Workflows shape: a jsonb
-- definition validated with zod at the write boundary, plus a version integer
-- so an edit is traceable. The attributes array is the definition; the
-- extracted VALUES (commit 3) will hang off the DOCUMENT anchor, never here.
--
-- REVERSIBILITY (the design goal commit 1 set up). collection_id is the
-- POINTER: in phase one a schema attaches to a collection, but the table is
-- shaped so that pointer could later aim at a document-type or org-level scope
-- instead. Because the extracted values attach to the document anchor and are
-- keyed by attribute (commit 3), re-pointing where a schema is DEFINED never
-- re-extracts or migrates the values. This thin pointer layer is what keeps
-- that separation intact.
--
-- ONE SCHEMA PER COLLECTION (phase one). collection_id is UNIQUE: a collection
-- has at most one schema definition. When the pointer is later generalized,
-- this constraint is what relaxes.
--
-- ADDITIVE. A new table only; no existing column or table is touched. The
-- documents anchor is unchanged. There is no NOT NULL tightening here (the
-- collection_documents.document_id tightening flagged in commit 1 remains a
-- separate follow-up).
--
-- IDEMPOTENT throughout (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF
-- EXISTS), safe to re-run.
-- ============================================================================


-- ============================================================================
-- Table: collection_schemas (the per-collection attribute definition)
-- ============================================================================

create table if not exists public.collection_schemas (
  id                 uuid primary key default gen_random_uuid(),
  -- The POINTER. ON DELETE CASCADE: a schema definition is meaningless without
  -- its collection. UNIQUE: one definition per collection in phase one (see the
  -- reversibility note above for why this is the constraint that later relaxes).
  collection_id      uuid not null unique references public.collections (id) on delete cascade,
  -- Denormalized org id, mirroring the collections family, so the org-scoped
  -- RLS fence reads it directly without a join. A collection belongs to exactly
  -- one organization; this is functionally determined by collection_id, and the
  -- write policy below additionally proves the collection is in this org so the
  -- denormalized value can never drift to a foreign tenant.
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  -- The definition: a zod-validated array of attributes, each
  -- { key, label, type, description, options? }. key is the STABLE machine
  -- identifier extraction/query reference; editing an attribute's human label
  -- never changes its key, so extracted values (commit 3, keyed by attribute)
  -- are not orphaned by a rename. Validation lives at the write boundary
  -- (lib/knowledge/collection-schema.ts), not as a CHECK, matching Workflows.
  attributes         jsonb not null default '[]'::jsonb,
  -- Workflows-style version: incremented on every save so a schema edit is
  -- traceable. Unlike Workflows (where version is reserved), the save action
  -- here bumps it, so the integer is a live edit counter.
  version            integer not null default 1,
  created_by_user_id uuid references public.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- FK index for organization_id: it is the org-scoped RLS predicate on every
-- read and write. collection_id is already indexed by its UNIQUE constraint.
-- created_by_user_id is deliberately NOT separately indexed: the table holds at
-- most one row per collection (tens of rows at admin scale), and created_by is
-- never a query predicate — an index there would be dead weight. This is the
-- explicit justification the "every FK has an index" convention asks for.
create index if not exists collection_schemas_organization_id_idx
  on public.collection_schemas (organization_id);

drop trigger if exists collection_schemas_updated_at on public.collection_schemas;
create trigger collection_schemas_updated_at
  before update on public.collection_schemas
  for each row execute function public.set_updated_at();

alter table public.collection_schemas enable row level security;

-- Read: org-scoped AND admin-only. A schema definition is admin configuration;
-- nothing user-facing reads it in phase one (the query UI that members will use
-- arrives in a later commit and will compose collection visibility then). So,
-- like the documents anchor (commit 1), admin-only read is the honest, leak-
-- free posture now — it never exposes a department-restricted collection's
-- structure to members who cannot see the collection.
drop policy if exists collection_schemas_read_in_org on public.collection_schemas;
create policy collection_schemas_read_in_org
  on public.collection_schemas
  for select
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() in ('super_admin', 'org_admin')
  );

-- Write: super admins only, inside their own org — matching the collections
-- family's super_admin-write posture. The with_check additionally proves the
-- target collection_id belongs to this org (the integrity guarantee that the
-- denormalized organization_id can never be paired with a foreign collection),
-- mirroring collection_documents' write policy.
drop policy if exists collection_schemas_super_admin_write on public.collection_schemas;
create policy collection_schemas_super_admin_write
  on public.collection_schemas
  for all
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() = 'super_admin'
  )
  with check (
    organization_id = public.current_org_id()
    and public.current_user_role() = 'super_admin'
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
-- 1. Table exists with RLS enabled:
--    select tablename, rowsecurity from pg_tables
--     where schemaname = 'public' and tablename = 'collection_schemas';
--    -- expect: 1 row, rowsecurity = true.
--
-- 2. Policies present:
--    select policyname from pg_policies where tablename = 'collection_schemas';
--    -- expect: collection_schemas_read_in_org, collection_schemas_super_admin_write.
--
-- 3. The unique pointer and the org FK index exist:
--    select indexname from pg_indexes
--     where tablename = 'collection_schemas';
--    -- expect: collection_schemas_pkey, the UNIQUE index on collection_id, and
--    --         collection_schemas_organization_id_idx.
--
-- 4. The updated_at trigger is attached:
--    select tgname from pg_trigger
--     where tgrelid = 'public.collection_schemas'::regclass and not tgisinternal;
--    -- expect: collection_schemas_updated_at.
