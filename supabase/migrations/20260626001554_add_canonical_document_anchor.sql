-- ============================================================================
-- 20260626001554_add_canonical_document_anchor.sql
-- Structured Query (phase one), commit 1 — the canonical document anchor.
-- ============================================================================
--
-- WHY. Until now a document exists ONLY as collection_documents rows, keyed
-- (collection_source_id, external_id). The same physical file reachable
-- through two collections is TWO inventory rows. There is no per-document
-- record. Structured Query will extract attributes from documents; for
-- "extract once, no drift" (one extraction shared across every collection a
-- file appears in) and for the schema-definition / extracted-data separation
-- that keeps where-schemas-live reversible later, those attributes must hang
-- off the DOCUMENT, not off per-collection inventory rows. This migration
-- introduces that anchor. It is the one NON-additive piece of the Structured
-- Query foundation; everything after it is additive.
--
-- IDENTITY. external_id is the repository's stable file id, but it is unique
-- only WITHIN a repository (connection), not globally. A collection_sources
-- row carries the connection; the file's physical identity is therefore
-- (connection_id, external_id). A connection belongs to exactly one
-- organization (D-136, migration 0066), so organization_id is functionally
-- determined by connection_id and the unique key (organization_id,
-- connection_id, external_id) selects exactly the same rows as
-- (connection_id, external_id) would. We include organization_id in the key
-- anyway so the uniqueness key and the org-scoped RLS fence agree, and so the
-- anchor is impossible to mis-tenant even in the face of future connection
-- reassignment. The same file via a DIFFERENT connection is correctly a
-- different document.
--
-- DELETE BEHAVIOR.
--   * documents.organization_id  -> organizations  ON DELETE CASCADE: the
--     anchor is org-owned; an org teardown removes it (matches the whole
--     collections family).
--   * documents.connection_id    -> connections    ON DELETE CASCADE: the
--     anchor is meaningless without the connection that identifies and reads
--     the file, and it is regenerable on the next sync. collection_sources
--     already RESTRICTs connection deletion while a source references it, so
--     in normal operation this never fires; CASCADE keeps an org teardown
--     clean and, unlike RESTRICT, introduces no delete-order hazard in the
--     organizations -> {connections, documents} diamond.
--   * collection_documents.document_id -> documents ON DELETE CASCADE: an
--     inventory row must not outlive its anchor. CASCADE also keeps the
--     organizations -> {collections -> collection_documents, documents}
--     diamond order-independent (RESTRICT here could fail an org delete
--     depending on cascade order). Document deletion is not exposed anywhere
--     in phase one, so the "deleting an anchor removes inventory links" edge
--     is theoretical today.
--
-- NULLABILITY. collection_documents.document_id is added NULLABLE and is left
-- nullable by this commit even though the backfill below populates every
-- existing row and the sync populates every new row. Reason: the project runs
-- live production traffic with no staging DB, and the code deploy (Vercel, on
-- push) is not atomic with this migration (operator runs `supabase db push`
-- separately, in either order). A NOT NULL constraint would make one ordering
-- (migration-before-deploy, where the still-running old code writes inventory
-- rows without document_id) fail under live traffic. Nullable + populate-on-
-- write is the safe-under-live-traffic choice. Tightening to NOT NULL is a
-- fast, safe follow-up once the populating code is fully deployed and the
-- column is verified 100% populated.
--
-- IDEMPOTENT throughout (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF
-- EXISTS / ON CONFLICT DO NOTHING / IS DISTINCT FROM guards), and the backfill
-- is safe to re-run.
-- ============================================================================


-- ============================================================================
-- PART 1 — Table: documents (the canonical per-document anchor)
-- ============================================================================

create table if not exists public.documents (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  -- The connection (repository account) the file lives in. external_id is
  -- unique only within this connection; see the identity note above.
  connection_id      uuid not null references public.connections (id) on delete cascade,
  -- The repository's stable document id.
  external_id        text not null,
  -- Denormalized metadata, refreshed to the most recent sync. The same fields
  -- the inventory carries, so extraction (later commits) reads identity and
  -- provenance from one canonical place.
  title              text not null default '',
  mime_type          text not null default '',
  size_bytes         bigint,
  modified_at_source timestamptz,
  source_url         text,
  -- The most recent sync pass that saw this file through any source.
  last_seen_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- The canonical identity key, and the ON CONFLICT arbiter the sync upserts on.
create unique index if not exists documents_org_connection_external_idx
  on public.documents (organization_id, connection_id, external_id);

-- FK index for connection_id. organization_id needs no separate index: it is
-- the leftmost column of the unique index above, which serves the org fence
-- and org-scoped reads.
create index if not exists documents_connection_id_idx
  on public.documents (connection_id);

drop trigger if exists documents_updated_at on public.documents;
create trigger documents_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

alter table public.documents enable row level security;

-- Read: org-scoped, admins only. The anchor spans collections (including
-- department-restricted ones), so it carries no per-collection visibility;
-- plain members read inventory through collection_documents, which composes
-- collection visibility. Nothing user-facing reads documents in phase one, so
-- admin-only read is the honest, leak-free posture.
drop policy if exists documents_read_in_org on public.documents;
create policy documents_read_in_org
  on public.documents
  for select
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() in ('super_admin', 'org_admin')
  );

-- Write: super admins only, inside their own org. The sync runs under the
-- RLS-enforced server client as a super admin (the action re-checks), exactly
-- like the collection_documents writes — this policy re-enforces at the DB.
drop policy if exists documents_super_admin_write on public.documents;
create policy documents_super_admin_write
  on public.documents
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
-- PART 2 — Link: collection_documents.document_id -> documents
-- ============================================================================
-- Additive: a new nullable FK alongside every existing column and the
-- (collection_source_id, external_id) inventory key, which is unchanged.

alter table public.collection_documents
  add column if not exists document_id uuid
    references public.documents (id) on delete cascade;

create index if not exists collection_documents_document_id_idx
  on public.collection_documents (document_id);


-- ============================================================================
-- PART 3 — Backfill: materialize anchors for the existing inventory
-- ============================================================================
-- Production already holds live inventory; this gives every existing
-- collection_documents row an anchor without requiring a re-sync. The
-- (organization_id, connection_id) for each inventory row is resolved by
-- joining out to its source's connection and its collection's organization.

-- 3a. One documents row per distinct (organization_id, connection_id,
--     external_id). DISTINCT ON keeps the freshest metadata (latest
--     last_seen_at) when a file appears in several collections/sources. The
--     ON CONFLICT DO NOTHING makes the step re-runnable.
insert into public.documents (
  organization_id,
  connection_id,
  external_id,
  title,
  mime_type,
  size_bytes,
  modified_at_source,
  source_url,
  last_seen_at
)
select distinct on (c.organization_id, cs.connection_id, cd.external_id)
  c.organization_id,
  cs.connection_id,
  cd.external_id,
  cd.title,
  cd.mime_type,
  cd.size_bytes,
  cd.modified_at_source,
  cd.source_url,
  cd.last_seen_at
from public.collection_documents cd
join public.collection_sources cs on cs.id = cd.collection_source_id
join public.collections c on c.id = cd.collection_id
order by
  c.organization_id,
  cs.connection_id,
  cd.external_id,
  cd.last_seen_at desc nulls last
on conflict (organization_id, connection_id, external_id) do nothing;

-- 3b. Point every inventory row at its anchor. The IS DISTINCT FROM guard
--     makes re-runs no-ops (and avoids needless updated_at churn). This is
--     where the "same file in two collections" case resolves to ONE anchor,
--     MANY links.
update public.collection_documents cd
set document_id = d.id
from public.collection_sources cs,
     public.collections c,
     public.documents d
where cs.id = cd.collection_source_id
  and c.id = cd.collection_id
  and d.organization_id = c.organization_id
  and d.connection_id = cs.connection_id
  and d.external_id = cd.external_id
  and cd.document_id is distinct from d.id;


-- ============================================================================
-- Verification (run after applying)
-- ============================================================================
-- 1. Table exists with RLS enabled:
--    select tablename, rowsecurity from pg_tables
--     where schemaname = 'public' and tablename = 'documents';
--    -- expect: 1 row, rowsecurity = true.
--
-- 2. Policies present:
--    select policyname from pg_policies where tablename = 'documents';
--    -- expect: documents_read_in_org, documents_super_admin_write.
--
-- 3. The identity key and FK indexes exist:
--    select indexname from pg_indexes
--     where tablename in ('documents', 'collection_documents')
--       and indexname in ('documents_org_connection_external_idx',
--                         'documents_connection_id_idx',
--                         'collection_documents_document_id_idx');
--    -- expect: 3 rows.
--
-- 4. Backfill complete and the cross-collection dedupe number:
--    select
--      (select count(*) from public.documents)                                    as documents_rows,
--      (select count(*) from public.collection_documents)                         as inventory_rows,
--      (select count(*) from public.collection_documents where document_id is null) as unanchored_rows;
--    -- expect: unanchored_rows = 0; documents_rows <= inventory_rows; the
--    --         difference (inventory_rows - documents_rows) is the number of
--    --         inventory rows that share a file with another collection/source
--    --         (the dedupe a single anchor now collapses).
--
-- 5. A file in two collections is one anchor, two links (spot check):
--    select document_id, count(*)
--      from public.collection_documents
--     where document_id is not null
--     group by document_id
--     having count(*) > 1
--     limit 5;
--    -- each such document_id is one anchor backing multiple inventory rows.
