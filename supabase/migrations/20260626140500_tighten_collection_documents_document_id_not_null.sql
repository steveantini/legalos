-- ============================================================================
-- 20260626140500_tighten_collection_documents_document_id_not_null.sql
-- Structured Query (phase one), commit 3 — the deferred commit-1 follow-up.
-- ============================================================================
--
-- WHY. Commit 1 added collection_documents.document_id NULLABLE on purpose: the
-- migration and the code deploy are not atomic under live traffic, so a NOT
-- NULL constraint applied before the populating code was live could have failed
-- inventory writes from the still-running old code (see the nullability note in
-- 20260626001554_add_canonical_document_anchor.sql). That window is now closed:
-- the populating sync has been live since commit 1, and the column was verified
-- 100% populated against live production data before this migration was
-- authored (16 of 16 inventory rows anchored, 0 NULL). Tightening to NOT NULL
-- now makes the anchor link a guarantee the extraction engine and commit 4's
-- query can rely on, rather than a defensively-checked maybe.
--
-- SAFETY. This is the one place the constraint could bite if the verification
-- were wrong, so the migration RE-VERIFIES at apply time: it raises a clear
-- exception (instead of a generic constraint-violation) if any NULL remains, so
-- a surprising environment fails loudly and recoverably rather than mid-ALTER.
-- The populating code already writes document_id on every inventory upsert, so
-- no backfill is needed here; the commit-1 backfill plus live writes did it.
--
-- IDEMPOTENT: setting NOT NULL on an already-NOT-NULL column is a no-op in
-- Postgres, and the guard re-checks cleanly on a re-run.
-- ============================================================================

do $$
declare
  unanchored bigint;
begin
  select count(*) into unanchored
    from public.collection_documents
   where document_id is null;

  if unanchored > 0 then
    raise exception
      'Cannot set collection_documents.document_id NOT NULL: % inventory row(s) are still unanchored. Run a collection sync to populate them, then re-apply.',
      unanchored;
  end if;
end $$;

alter table public.collection_documents
  alter column document_id set not null;


-- ============================================================================
-- Verification (run after applying)
-- ============================================================================
-- select is_nullable from information_schema.columns
--  where table_name = 'collection_documents' and column_name = 'document_id';
-- -- expect: NO.
