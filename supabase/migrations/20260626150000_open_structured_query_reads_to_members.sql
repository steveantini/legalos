-- ============================================================================
-- 20260626150000_open_structured_query_reads_to_members.sql
-- Structured Query (phase one), commit 5 — open the READ side to members.
-- ============================================================================
--
-- WHY. Commits 2 and 3 deliberately kept the schema definition
-- (collection_schemas) and the extracted values (document_extractions)
-- ADMIN-ONLY on read, with an explicit note on each policy: "the user-facing
-- query surface that members will use arrives in a later commit and will
-- compose collection visibility then." This is that commit. The natural-
-- language question-asking surface is member-facing: a member needs to (a) see
-- which ATTRIBUTES a collection tracks (so they know what they can ask) and
-- (b) read the extracted VALUES (so the engine returns real counts for them).
-- Both reads are opened here, scoped to COLLECTION VISIBILITY, not to a role.
--
-- THE SCOPING — COMPOSE collection visibility, do not invent a new one. A
-- member may read a schema / a value exactly when they can SEE a collection it
-- belongs to. Each new read policy proves that with an EXISTS subquery against
-- public.collections; because that subquery runs under the CALLER's row-level
-- security, it returns a row only for a collection the caller can already see
-- (the collections policies decide: org-wide collections, plus the caller's
-- department-scoped ones). So:
--   * a member reads a department-restricted collection's structure / values
--     only if they belong to that department (never a leak);
--   * a super_admin / org_admin, who can see every collection in the org,
--     keeps full read, exactly as before.
-- This is the honest, RLS-enforced posture the commit-2/3 notes anticipated:
-- the security boundary is the policy, not a server-side projection.
--
-- DEFINITION (writes) STAYS SUPER-ADMIN. Only the SELECT policies change. The
-- super_admin write policies on both tables are untouched: a member can read
-- what a collection tracks and query its values, but defining or editing a
-- schema, and writing extracted values, remain super-admin-only. Read opens;
-- authorship does not.
--
-- VALUES ARE DOCUMENT-LEVEL (shared across collections). An extracted value
-- attaches to the document anchor (commit 1), so a document shared by two
-- collections has one value. The document_extractions read policy therefore
-- asks "can the caller see ANY collection containing this document": if a
-- member can see a collection that includes the document, they may read its
-- value (which is the same value every collection shares). This matches the
-- extract-once design and never exposes a value for a document the member
-- cannot reach through any visible collection.
--
-- See DECISION_LOG D-200 (the engine) and the commit-5 question surface.
-- ============================================================================

-- collection_schemas: a member may read a schema for a collection they can see.
-- Replaces the admin-only collection_schemas_read_in_org (commit 2).
drop policy if exists collection_schemas_read_in_org on public.collection_schemas;
drop policy if exists collection_schemas_read_for_visible_collection on public.collection_schemas;
create policy collection_schemas_read_for_visible_collection
  on public.collection_schemas
  for select
  using (
    organization_id = public.current_org_id()
    and exists (
      select 1
        from public.collections c
       where c.id = collection_id
    )
  );

-- document_extractions: a member may read a value for a document that lives in
-- a collection they can see. Replaces the admin-only
-- document_extractions_read_in_org (commit 3).
drop policy if exists document_extractions_read_in_org on public.document_extractions;
drop policy if exists document_extractions_read_for_visible_collection on public.document_extractions;
create policy document_extractions_read_for_visible_collection
  on public.document_extractions
  for select
  using (
    organization_id = public.current_org_id()
    and exists (
      select 1
        from public.collection_documents cd
        join public.collections c on c.id = cd.collection_id
       where cd.document_id = document_extractions.document_id
    )
  );

-- ============================================================================
-- Verification (run after applying)
-- ============================================================================
-- 1. The new read policies are present and the admin-only ones are gone:
--    select policyname from pg_policies
--     where tablename in ('collection_schemas', 'document_extractions')
--       and cmd = 'SELECT';
--    -- expect: collection_schemas_read_for_visible_collection,
--    --         document_extractions_read_for_visible_collection
--    --         (NOT *_read_in_org).
--
-- 2. The write policies are untouched (still super-admin):
--    select policyname from pg_policies
--     where tablename in ('collection_schemas', 'document_extractions')
--       and cmd = 'ALL';
--    -- expect: collection_schemas_super_admin_write,
--    --         document_extractions_super_admin_write.
