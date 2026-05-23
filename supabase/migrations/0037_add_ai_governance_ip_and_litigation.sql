-- ============================================================================
-- legalOS
-- Migration 0037 — Add three new departments at their reserved
--                   positions: AI Governance, IP, Litigation
-- ============================================================================
--
-- Fills the three vacant slots created by migration 0036:
--
--   - AI Governance at sort_order 7   (Regulatory & compliance cluster,
--                                       following Privacy at 6)
--   - IP at sort_order 10              (Specialized practice areas
--                                       cluster, following Employment at 9)
--   - Litigation at sort_order 11      (Specialized practice areas
--                                       cluster, following IP at 10)
--
-- All three slots were reserved by 0036 — no sort_order bumping is
-- needed here. This migration is purely additive.
--
-- Department naming notes:
--   - "AI Governance" — the practice area as named in industry today;
--     mirrors the C4L plugin name (ai-governance-legal). Precedent:
--     Privacy started as a "specialized regulatory subset" and matured
--     into its own discipline; AI governance is on the same
--     trajectory and now warrants peer status.
--   - "IP" — the abbreviation is industry-standard among legal
--     practitioners ("IP counsel" is how the role is described).
--     Mirrors the C4L plugin name (ip-legal).
--   - "Litigation" — canonical practice-area name. Mirrors the C4L
--     plugin name (litigation-legal). In-house framing: managing the
--     matter portfolio + outside counsel coordination, not personally
--     trying cases.
--
-- Schema impact: zero. Three new department rows, each with a fresh
-- UUID, inheriting existing RLS policy logic. Other departments
-- unchanged.
--
-- Idempotent: `on conflict (organization_id, slug) do update` on each
-- INSERT so re-runs update the existing rows in place.
-- ============================================================================

begin;

insert into public.departments (organization_id, slug, name, description, sort_order)
select
  o.id,
  'ai-governance',
  'AI Governance',
  'AI use case assessment, AI impact assessments, vendor AI review, model governance, and AI regulatory compliance.',
  7
  from public.organizations o
on conflict (organization_id, slug) do update
   set name        = excluded.name,
       description = excluded.description,
       sort_order  = excluded.sort_order,
       updated_at  = now();

insert into public.departments (organization_id, slug, name, description, sort_order)
select
  o.id,
  'ip',
  'IP',
  'Trademark, copyright, patent, trade secret, IP licensing, and open source compliance.',
  10
  from public.organizations o
on conflict (organization_id, slug) do update
   set name        = excluded.name,
       description = excluded.description,
       sort_order  = excluded.sort_order,
       updated_at  = now();

insert into public.departments (organization_id, slug, name, description, sort_order)
select
  o.id,
  'litigation',
  'Litigation',
  'Matter intake, demand letter response, dispute management, discovery, and outside counsel coordination.',
  11
  from public.organizations o
on conflict (organization_id, slug) do update
   set name        = excluded.name,
       description = excluded.description,
       sort_order  = excluded.sort_order,
       updated_at  = now();

commit;

-- ============================================================================
-- Reverse (do not run unless rolling back the additions):
--
-- begin;
--   delete from public.departments
--    where slug in ('ai-governance', 'ip', 'litigation');
-- commit;
--
-- Note: the DELETEs above rely on `on delete cascade` from
-- user_department_roles.department_id and `on delete restrict` from
-- agents.department_id. If any of these departments accumulate agents
-- (via the C4L imports for ai-governance-legal, ip-legal, or
-- litigation-legal, or otherwise), the DELETE will fail until those
-- agents are moved or deleted. Reverse path is intended for use only
-- when no agents exist yet under these departments.
-- ============================================================================
