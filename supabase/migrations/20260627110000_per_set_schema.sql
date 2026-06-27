-- ============================================================================
-- 20260627110000_per_set_schema.sql
-- Knowledge folders rework, Step 3a — schema becomes a per-SET "document kind".
-- ============================================================================
--
-- WHY. A schema (a set of fields) describes a KIND of document and should apply
-- to a SET of folders, defined ONCE, not once per folder. Phase one made it 1:1
-- (collection_schemas.collection_id UNIQUE), and that migration noted: "When the
-- pointer is later generalized, this constraint is what relaxes." This is that
-- relax. collection_schemas becomes a free-standing schema ENTITY; folders
-- (auto-folder collections) point AT it via collections.schema_id (many folders
-- → one schema). BEHAVIOR IS IDENTICAL after this migration: every existing 1:1
-- schema is backfilled into a set-of-one, so nothing changes until the 3b UX.
--
-- Extraction is unaffected: values stay DOCUMENT-anchored (document_extractions
-- keyed on (document_id, attribute_key); source_collection_schema_id is a soft
-- pointer). A document shared across two folders of a set extracts ONCE (the
-- prepare path unions the set's documents, deduped by document_id). Derived
-- staleness is unchanged (it keys on document + source_collection_schema_id +
-- extracted_against_schema_version), so a version bump on the shared schema
-- marks every member document stale.
--
-- KNOWN WATCH-ITEM (not fixed here): the extraction key (document_id,
-- attribute_key) is GLOBAL, so two DIFFERENT schemas defining a same-named
-- attribute over a SHARED document collide (last writer wins). Per-set does not
-- worsen this within a set; a future fix would add source_collection_schema_id
-- to the key. Recorded in DECISION_LOG D-209.
-- ============================================================================

-- 1. collection_schemas becomes the schema ENTITY.
--    - Drop the 1:1 UNIQUE on collection_id (the relax).
--    - collection_id stays for back-compat/audit only: make it NULLABLE and
--      change its FK to ON DELETE SET NULL, so deleting the original home folder
--      never nukes a schema other folders still share.
--    - Add `name` (the kind label, e.g. "Contracts"); nullable, the 3b UX sets
--      it, and existing rows are backfilled from their home collection's name.
alter table public.collection_schemas
  drop constraint if exists collection_schemas_collection_id_key;

alter table public.collection_schemas
  drop constraint if exists collection_schemas_collection_id_fkey;

alter table public.collection_schemas
  alter column collection_id drop not null;

alter table public.collection_schemas
  add constraint collection_schemas_collection_id_fkey
  foreign key (collection_id) references public.collections (id) on delete set null;

alter table public.collection_schemas
  add column if not exists name text;

-- 2. collections point AT a schema (the set pointer). Nullable; ON DELETE SET
--    NULL so deleting a schema entity leaves its folders intact (unset).
alter table public.collections
  add column if not exists schema_id uuid references public.collection_schemas (id) on delete set null;

create index if not exists collections_schema_idx
  on public.collections (schema_id);

-- 3. BACKFILL (correctness-critical): every existing 1:1 schema becomes a
--    set-of-one. Point each collection at the schema that named it, and give the
--    schema the collection's name as its kind label.
update public.collections c
   set schema_id = s.id
  from public.collection_schemas s
 where s.collection_id = c.id
   and c.schema_id is null;

update public.collection_schemas s
   set name = c.name
  from public.collections c
 where c.id = s.collection_id
   and s.name is null;

-- 4. RLS — read composes visibility via the FOLDERS THAT POINT AT the schema
--    (a schema is readable exactly when the caller can see at least one folder
--    using it). The subquery runs under the caller's RLS on collections, so it
--    matches only folders the caller can see: no leak, no over-hide. Replaces
--    the old c.id = collection_id form (which assumed the 1:1 ownership).
drop policy if exists collection_schemas_read_for_visible_collection on public.collection_schemas;
create policy collection_schemas_read_for_visible_collection
  on public.collection_schemas
  for select
  using (
    organization_id = public.current_org_id()
    and exists (
      select 1
        from public.collections c
       where c.schema_id = collection_schemas.id
    )
  );

-- Write stays super-admin in-org. The old with_check proved collection_id was an
-- in-org collection; that proof is dropped because collection_id is no longer
-- the identity (a schema entity is org-owned directly).
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
  );

-- document_extractions RLS is intentionally UNCHANGED: it composes visibility via
-- collection_documents -> collections (document-anchored), which the schema
-- generalization does not touch. (Verified in this commit's report.)

-- ============================================================================
-- Verification (run after applying)
-- ============================================================================
-- 1. The 1:1 UNIQUE is gone; collection_id is nullable:
--    select is_nullable from information_schema.columns
--     where table_name = 'collection_schemas' and column_name = 'collection_id';
--    -- expect: YES.
--    select 1 from pg_constraint where conname = 'collection_schemas_collection_id_key';
--    -- expect: 0 rows.
--
-- 2. collections.schema_id + name exist:
--    select count(*) from information_schema.columns
--     where (table_name='collections' and column_name='schema_id')
--        or (table_name='collection_schemas' and column_name='name');
--    -- expect: 2.
--
-- 3. BACKFILL covers every schema with zero orphans (every schema has >=1 member
--    folder pointing at it, and every collection that had a 1:1 schema now points):
--    select count(*) from public.collection_schemas s
--     where not exists (select 1 from public.collections c where c.schema_id = s.id);
--    -- expect: 0 (no schema without a member folder).
--    select count(*) from public.collection_schemas s
--     where s.collection_id is not null
--       and (select schema_id from public.collections c where c.id = s.collection_id) is distinct from s.id;
--    -- expect: 0 (every home collection points back at its schema).
--
-- 4. The read policy composes via member folders:
--    select policyname from pg_policies
--     where tablename = 'collection_schemas' and cmd = 'SELECT';
--    -- expect: collection_schemas_read_for_visible_collection.
