-- ============================================================================
-- legalOS
-- Migration 0031 — Add the Employment department
-- ============================================================================
--
-- Adds Employment as a peer practice-area department at sort_order 7,
-- between Compliance (6) and Operations (was 7, now 8). The existing
-- 8-department taxonomy omitted Employment; this migration fills the
-- gap.
--
-- Rationale: Employment law is a standard in-house legal function —
-- hiring, terminations, employment agreements, compensation and
-- benefits, workplace policy, labor relations.
--
-- Ordering rule (established here as the canonical pattern): Operations
-- and General Tools are always last in that order. When new
-- substantive practice-area departments are added, they slot in before
-- Operations; Operations and General Tools shift their sort_order
-- accordingly.
--
-- The new department renders with the same neutral card treatment as
-- the other 8 — no per-department color, consistent with the existing
-- design discipline (content differentiates, not color).
--
-- Schema impact: zero. agents.department_id, user_department_roles.
-- department_id, and any other FK use the UUID. The Employment row
-- gets a fresh UUID and inherits the existing RLS policy logic
-- automatically. Operations and General Tools keep their UUIDs and
-- their attached agents — only their sort_order changes.
--
-- Idempotent: the inserts use `on conflict (organization_id, slug)
-- do update` so re-runs update the existing row in place. The
-- sort_order updates are idempotent on their own (re-running just
-- rewrites the same number with a fresh updated_at).
-- ============================================================================

begin;

-- Bump Operations and General Tools to free sort_order 7 for
-- Employment. Update order matters: bumping Operations (7 → 8) first
-- prevents a transient state where two rows share sort_order 7.
-- General Tools moves from 8 to 9 in a separate UPDATE so the
-- intermediate state where Operations and General Tools both hold 8
-- is also avoided (Operations writes 8 first; General Tools then
-- writes 9 over its own old value of 8).
update public.departments
   set sort_order = 8,
       updated_at = now()
 where slug = 'operations';

update public.departments
   set sort_order = 9,
       updated_at = now()
 where slug = 'general-tools';

-- Insert Employment at sort_order 7 for every organization. The
-- product is single-tenant today but writing the insert against the
-- full organizations set correctly handles the multi-org case.
insert into public.departments (organization_id, slug, name, description, sort_order)
select
  o.id,
  'employment',
  'Employment',
  'Hiring, terminations, employment agreements, compensation and benefits, workplace policy, and labor relations.',
  7
  from public.organizations o
on conflict (organization_id, slug) do update
   set name        = excluded.name,
       description = excluded.description,
       sort_order  = excluded.sort_order,
       updated_at  = now();

commit;

-- ============================================================================
-- Reverse (do not run unless rolling back the addition of Employment):
--
-- begin;
--   delete from public.departments where slug = 'employment';
--   update public.departments set sort_order = 7, updated_at = now() where slug = 'operations';
--   update public.departments set sort_order = 8, updated_at = now() where slug = 'general-tools';
-- commit;
--
-- Note: the DELETE above relies on `on delete cascade` from
-- user_department_roles.department_id and `on delete restrict` from
-- agents.department_id. If Employment ever accumulates agents (via the
-- C4L employment-legal import or otherwise), the DELETE will fail
-- until those agents are moved or deleted. Reverse path is intended
-- for use only when no agents exist yet under Employment.
-- ============================================================================
