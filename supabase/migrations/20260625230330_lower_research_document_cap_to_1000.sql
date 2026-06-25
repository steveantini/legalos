-- ============================================================================
-- 20260625230330_lower_research_document_cap_to_1000.sql
-- Research per-run document cap: tighten the upper bound from 5000 to 1000.
-- ============================================================================
--
-- The original cap (0071) allowed 1..5000, but 5000 is unreachable in
-- practice: the research engine enumerates a scope LIVE in a single bounded
-- pass (40 list calls, ~4,000 documents best case for a single flat folder,
-- far fewer for any real folder structure), and a scope it can't fully walk
-- declines rather than running partial. Combined with run time (sequential
-- ~12-document segments) and findings usability (the findings list is not
-- virtualized), the honest reliable ceiling is ~1,000; the default of 200 is
-- well-chosen and unchanged. This lowers the admin-adjustable maximum to a
-- value the engine can actually deliver. The bound is set by enumeration
-- reachability + runtime + findings usability, NOT by storage: documents are
-- never stored (only metadata + short findings), so this needs no infra
-- change.
--
-- SAFE ON EXISTING DATA: clamp any value above the new ceiling DOWN to 1000
-- FIRST, so the tighter CHECK can never reject a live row, THEN swap the
-- constraint. (At authoring time both organizations sit at the default 200,
-- so the clamp is a no-op, but it keeps the migration correct for any
-- environment where an admin had raised the cap above 1000.)
--
-- IDEMPOTENT: the clamp is a bounded UPDATE; the constraint swap is
-- drop-if-exists then add. Re-applying converges.
-- ============================================================================

-- 1. Clamp first: no row may exceed the new ceiling when the CHECK lands.
update public.organizations
   set research_document_cap = 1000
 where research_document_cap > 1000;

-- 2. Swap the bound from 1..5000 to 1..1000.
alter table public.organizations
  drop constraint if exists organizations_research_document_cap_check;

alter table public.organizations
  add constraint organizations_research_document_cap_check
  check (research_document_cap between 1 and 1000);

-- 3. Keep the column comment honest about the new range.
comment on column public.organizations.research_document_cap is
  'Maximum documents one research run may read. Default 200; super-admin-adjustable in Policy & access (range 1-1000). Over-cap scopes are declined honestly before running, never silently truncated. The bound reflects live-enumeration reachability, run time, and findings usability, not storage.';

-- ============================================================================
-- Verification (run after applying)
-- ============================================================================
-- 1. The new bound:
--    select pg_get_constraintdef(oid) from pg_constraint
--     where conname = 'organizations_research_document_cap_check';
--    -- expect: CHECK (((research_document_cap >= 1) AND (research_document_cap <= 1000)))
--
-- 2. No row exceeds it:
--    select count(*) from public.organizations where research_document_cap > 1000;
--    -- expect: 0
