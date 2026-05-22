-- ============================================================================
-- legalOS
-- Migration 0034 — Add the Regulatory department
-- ============================================================================
--
-- Adds Regulatory as a peer practice-area department at sort_order 3 —
-- the slot reserved by migration 0033 within the "regulatory &
-- compliance" cluster of the four-group taxonomy (positions 3–6),
-- ahead of Public Sector (4), Compliance (5), and Privacy (6).
--
-- Rationale: Regulatory law is a distinct in-house legal function —
-- advising regulated entities on compliance with sector-specific rules
-- (financial services, healthcare, telecommunications, energy,
-- consumer protection, enforcement defense). Distinct from:
--   - Public Sector (selling to / contracting with government, not
--     being regulated by it)
--   - Compliance (running the compliance program — policies, training,
--     audits — not advising on regulatory substance)
--   - Privacy (one specialized regulatory subset that matured into
--     its own discipline)
--
-- The slot at sort_order 3 was reserved by migration 0033, so no
-- sort_order bumping is needed here. This migration is purely
-- additive.
--
-- Schema impact: zero. New department row gets a fresh UUID and
-- inherits existing RLS policy logic. Other departments unchanged.
--
-- Idempotent: `on conflict (organization_id, slug) do update` so
-- re-runs update the existing row in place rather than failing.
-- ============================================================================

begin;

insert into public.departments (organization_id, slug, name, description, sort_order)
select
  o.id,
  'regulatory',
  'Regulatory',
  'Sector-specific regulatory advice — financial services, healthcare, telecommunications, energy, consumer protection, and enforcement defense.',
  3
  from public.organizations o
on conflict (organization_id, slug) do update
   set name        = excluded.name,
       description = excluded.description,
       sort_order  = excluded.sort_order,
       updated_at  = now();

commit;

-- ============================================================================
-- Reverse (do not run unless rolling back the addition of Regulatory):
--
-- begin;
--   delete from public.departments where slug = 'regulatory';
-- commit;
--
-- Note: the DELETE above relies on `on delete cascade` from
-- user_department_roles.department_id and `on delete restrict` from
-- agents.department_id. If Regulatory ever accumulates agents (via the
-- C4L regulatory-legal import or otherwise), the DELETE will fail
-- until those agents are moved or deleted. Reverse path is intended
-- for use only when no agents exist yet under Regulatory.
-- ============================================================================
