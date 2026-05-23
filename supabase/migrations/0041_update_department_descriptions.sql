-- ============================================================================
-- legalOS
-- Migration 0041 — Update department descriptions for Commercial, Public
--                  Sector, Operations, and General Tools
-- ============================================================================
--
-- Brings the four remaining department descriptions into voice and
-- scope consistency with the other 9 departments:
--
--   - Commercial: drops "Artificial Intelligence Addenda" — describes
--     an agent that doesn't exist, and AI work properly belongs to the
--     AI Governance department (sort_order 7) added in migration 0037.
--     Reframed in sentence case as a noun list ending with a period,
--     matching the other 9 descriptions.
--
--   - Public Sector: removes "regulatory affairs" — overlaps with the
--     Regulatory department (sort_order 3) added in migration 0034.
--     The new scope is government contracts / public procurement /
--     FOIA responses / policy advocacy, all genuinely public-sector
--     workstreams without overlap.
--
--   - Operations: removes "corporate transactions" — overlaps with the
--     Corporate department (sort_order 2). Reframed around the legal
--     team's own operations (team operations, vendor management,
--     internal policies, legal-spend management) rather than generic
--     internal operations.
--
--   - General Tools: replaces "general purpose agentic tools" (internal
--     jargon, lowercase, no period) with a sentence-case description
--     of the intended scope (cross-functional utilities, research
--     helpers, drafting assistants).
--
-- All four updates establish voice consistency with the other 9
-- departments: sentence case, noun-list format, ending with a period.
--
-- The companion update to `supabase/seed/0001_org_and_departments.sql`
-- lands alongside this migration so a fresh seed reproduces the
-- post-migration state. The seed's ON CONFLICT clause includes
-- `description = excluded.description`, so re-seeding against an
-- already-migrated DB also keeps the description in sync.
--
-- Idempotent in practice: re-running this migration just rewrites the
-- same descriptions with a fresh `updated_at`. No structural change.
-- ============================================================================

begin;

update public.departments
   set description = 'Revenue agreements, procurement contracts, non-disclosure agreements, and master agreement reviews.',
       updated_at = now()
 where slug = 'commercial';

update public.departments
   set description = 'Government contracts, public procurement, FOIA responses, and policy advocacy.',
       updated_at = now()
 where slug = 'public-sector';

update public.departments
   set description = 'Legal-team operations, vendor management, internal policies, and legal-spend management.',
       updated_at = now()
 where slug = 'operations';

update public.departments
   set description = 'Cross-functional utilities, research helpers, and general-purpose drafting assistants.',
       updated_at = now()
 where slug = 'general-tools';

commit;

-- ============================================================================
-- Reverse (do not run unless rolling back the description updates):
--
-- begin;
-- update public.departments
--    set description = 'Revenue (sell-side) agreements, procurement (buy-side) agreements, Non-Disclosure Agreements, Artificial Intelligence Addenda.',
--        updated_at = now()
--  where slug = 'commercial';
-- update public.departments
--    set description = 'Government relations, regulatory affairs, public-sector contracts, and policy advocacy.',
--        updated_at = now()
--  where slug = 'public-sector';
-- update public.departments
--    set description = 'Internal operations, vendor management, procurement, and corporate transactions.',
--        updated_at = now()
--  where slug = 'operations';
-- update public.departments
--    set description = 'general purpose agentic tools',
--        updated_at = now()
--  where slug = 'general-tools';
-- commit;
-- ============================================================================
