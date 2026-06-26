-- ============================================================================
-- 20260626140000_add_document_extractions.sql
-- Structured Query (phase one), commit 3 — the EXTRACTED VALUES, with state.
-- ============================================================================
--
-- WHY. Commit 1 gave every document a canonical anchor; commit 2 let an admin
-- DEFINE a collection's schema (the attributes worth extracting). This commit
-- stores the extracted VALUES: for each (document, attribute), the value the
-- model pulled out, the verbatim quote that supports it, whether that quote
-- was VERIFIED as a real substring of the source, an honest found / not-found
-- flag, and the freshness metadata that lets the system know — and show —
-- what is current, stale, or never prepared. Nothing here triggers a model
-- call; the reconcile engine (lib/knowledge/extraction) writes these rows.
--
-- THE ANCHOR, NOT THE COLLECTION. A value attaches to the DOCUMENT
-- (document_id, the commit-1 anchor), keyed by the STABLE attribute_key
-- (commit 2). One row per (document_id, attribute_key): a file shared across
-- collections is extracted ONCE and shared, never re-extracted per collection
-- (the "extract once, no drift" design commit 1 set up). source_collection_
-- schema_id records WHICH collection's schema most recently produced the row,
-- for auditability and for the version-based staleness check below; it is a
-- soft pointer (ON DELETE SET NULL), never the value's identity.
--
-- STALENESS IS DERIVED, NEVER STORED. There is deliberately no "is_stale"
-- column to drift. A (document, attribute) pair is stale, relative to a
-- collection C whose schema S is at version V, exactly when:
--   * no row exists for (document_id, attribute_key)                  — never prepared
--   * documents.modified_at_source > the row's document_modified_at_source
--                                                                     — the doc changed since
--   * the row was produced by C's own schema (source_collection_schema_id = S.id)
--     AND V > extracted_against_schema_version                        — the definition changed since
-- The first two are universal; the third is per-collection, so a definition
-- change in one collection refreshes that collection's view without forcing a
-- re-extraction everywhere the document also appears. A row another schema
-- produced is REUSED as long as the document is unmodified — the deliberate
-- "extract once across collections" benefit. (The pure predicate and the work
-- selection live in lib/knowledge/extraction/extract.ts and are unit-tested;
-- this comment is the contract they implement.) See DECISION_LOG D-199.
--
-- VALUE STORAGE — QUERYABLE PER TYPE (the commit-4 contract). Every found
-- value carries value_text (the human-readable form, always populated, and
-- what text/enum attributes are queried on). Numeric, date, and boolean
-- attributes ALSO populate a dedicated typed column (value_number / value_date
-- / value_boolean) when the model's string parses cleanly, so commit 4's
-- deterministic query reads exactly one column per type: number → value_number
-- (range / comparison), date → value_date (before / after / range), boolean →
-- value_boolean (filter / count), text & enum → value_text (contains / exact).
-- A value that does not parse into its typed column keeps value_text (honest
-- raw) with the typed column null — never a silently coerced wrong number.
--
-- HONEST NOT-FOUND + TRUNCATION. found=false is a real, stored answer ("this
-- attribute is not in this document"), never a guess. source_read_incomplete
-- records that the document was truncated at the 60k read budget, so a
-- not-found can be qualified honestly ("not found in the portion read").
-- citation_verified is the substring-check result: a value whose quote does
-- not actually appear in the source keeps its value but is flagged
-- unverified, so the eventual count stays auditable.
--
-- ADDITIVE. A new table only; no existing table or column is touched. The
-- collection_documents.document_id NOT NULL tightening (the commit-1 follow-up)
-- is a SEPARATE migration in this same commit. IDEMPOTENT throughout
-- (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS), safe to re-run.
-- ============================================================================


-- ============================================================================
-- Table: document_extractions (one extracted value per document per attribute)
-- ============================================================================

create table if not exists public.document_extractions (
  id                            uuid primary key default gen_random_uuid(),
  -- The anchor. ON DELETE CASCADE: an extracted value is meaningless without
  -- its document, and is regenerable by re-preparing.
  document_id                   uuid not null references public.documents (id) on delete cascade,
  -- Denormalized org id, mirroring the family, so the org-scoped RLS fence
  -- reads it directly. Functionally determined by document_id; the write
  -- policy below proves the document is in this org so it can never drift.
  organization_id               uuid not null references public.organizations (id) on delete cascade,
  -- Which collection's schema most recently produced this row. SOFT pointer
  -- (ON DELETE SET NULL): used for auditability and the per-collection version
  -- staleness check, never the value's identity. Null = the producing schema
  -- was deleted; the row's value survives (it belongs to the document).
  source_collection_schema_id   uuid references public.collection_schemas (id) on delete set null,
  -- The STABLE attribute key (commit 2). A label rename never changes it, so a
  -- stored value is never orphaned by a rename.
  attribute_key                 text not null,
  -- The attribute's type AT EXTRACTION, so commit 4 knows which typed column to
  -- read without re-joining the (mutable) schema, and so the record is honest
  -- about what type drove the extraction.
  attribute_type                text not null
                                  check (attribute_type in ('text', 'number', 'date', 'boolean', 'enum')),
  -- Honest answer: was the attribute present in the document at all?
  found                         boolean not null default false,
  -- The human-readable value (always populated when found), and what text/enum
  -- are queried on.
  value_text                    text,
  -- Typed columns for deterministic querying (commit 4); populated only when
  -- the value parses cleanly for its type, else null with value_text kept.
  value_number                  double precision,
  value_date                    date,
  value_boolean                 boolean,
  -- The verbatim supporting quote, and whether it was verified as an actual
  -- substring of the source text (the credibility upgrade over Research).
  citation_excerpt              text not null default '',
  citation_verified             boolean not null default false,
  -- The source was truncated at the 60k read budget, so a not-found here may be
  -- beyond the read; surfaced honestly rather than asserted as absent.
  source_read_incomplete        boolean not null default false,
  -- Audit / staleness inputs.
  extracted_at                  timestamptz not null default now(),
  -- The producing schema's version at extraction (the version staleness check).
  extracted_against_schema_version integer not null default 1,
  -- Which model produced the value (model-agnostic record; the value rides the
  -- same per-org model resolution Research uses).
  extracted_model_id            text not null default '',
  -- The document's modified_at_source AT extraction; compared against the live
  -- anchor to derive doc-changed staleness. Nullable: a repository may not
  -- expose a modified time.
  document_modified_at_source   timestamptz,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

-- One value per (document, attribute) — the "extract once, shared" key and the
-- ON CONFLICT arbiter the reconcile engine upserts on.
create unique index if not exists document_extractions_document_attribute_idx
  on public.document_extractions (document_id, attribute_key);

-- Org + attribute: serves the org-scoped RLS fence (organization_id leftmost)
-- AND commit 4's "every document's value for attribute X" query pattern.
create index if not exists document_extractions_org_attribute_idx
  on public.document_extractions (organization_id, attribute_key);

-- FK index for the soft schema pointer.
create index if not exists document_extractions_source_schema_idx
  on public.document_extractions (source_collection_schema_id);

drop trigger if exists document_extractions_updated_at on public.document_extractions;
create trigger document_extractions_updated_at
  before update on public.document_extractions
  for each row execute function public.set_updated_at();

alter table public.document_extractions enable row level security;

-- Read: org-scoped, admins only — matching the documents anchor and the schema
-- definition (commits 1 and 2). The user-facing query surface that members will
-- use arrives in a later commit and will compose collection visibility then; for
-- now admin-only read is the honest, leak-free posture.
drop policy if exists document_extractions_read_in_org on public.document_extractions;
create policy document_extractions_read_in_org
  on public.document_extractions
  for select
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() in ('super_admin', 'org_admin')
  );

-- Write: super admins only, inside their own org. The reconcile engine runs
-- under the RLS-enforced server client as the super admin who triggered it
-- (the action re-checks), exactly like the sync and schema writes. The
-- with_check additionally proves the target document belongs to this org, so
-- the denormalized organization_id can never be paired with a foreign anchor
-- (mirroring collection_schemas' collection-in-org proof).
drop policy if exists document_extractions_super_admin_write on public.document_extractions;
create policy document_extractions_super_admin_write
  on public.document_extractions
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
        from public.documents d
       where d.id = document_id
         and d.organization_id = public.current_org_id()
    )
  );


-- ============================================================================
-- Verification (run after applying)
-- ============================================================================
-- 1. Table exists with RLS enabled:
--    select tablename, rowsecurity from pg_tables
--     where schemaname = 'public' and tablename = 'document_extractions';
--    -- expect: 1 row, rowsecurity = true.
--
-- 2. Policies present:
--    select policyname from pg_policies where tablename = 'document_extractions';
--    -- expect: document_extractions_read_in_org,
--    --         document_extractions_super_admin_write.
--
-- 3. Indexes present:
--    select indexname from pg_indexes where tablename = 'document_extractions';
--    -- expect: the pkey, document_extractions_document_attribute_idx (unique),
--    --         document_extractions_org_attribute_idx,
--    --         document_extractions_source_schema_idx.
--
-- 4. The updated_at trigger is attached:
--    select tgname from pg_trigger
--     where tgrelid = 'public.document_extractions'::regclass and not tgisinternal;
--    -- expect: document_extractions_updated_at.
