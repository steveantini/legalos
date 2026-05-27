-- 0043_soft_delete_compliance_and_public_sector.sql
--
-- Soft-deletes the `compliance` and `public-sector` departments and their
-- agents. These two were part of the initial seed but haven't earned their
-- position in the default experience; the product launches without them.
--
-- Soft-delete (not hard-delete) for two reasons:
--
-- 1. Schema contract. agents.department_id (0001), conversations.agent_id
--    (0004), and usage_events.agent_id (0004) are all ON DELETE RESTRICT.
--    The schema deliberately prevents cascading deletes that would erase
--    billing records or historical conversation data — usage_events.agent_id
--    is documented in 0004 as "deleting a user or agent should not silently
--    erase the billing record." A hard DELETE on these departments would
--    fail at the first RESTRICT FK; soft-delete is the only correct path.
--
-- 2. Future-state durability. Super-admin department management (per roadmap
--    item 12, "Scalable department configuration") will need this same
--    mechanism when it ships, because workspace-admins can't bypass the
--    schema invariants either. Establishing the soft-delete pattern now
--    means the future surface inherits it.
--
-- After this migration the two departments and their 3 agents remain in the
-- DB with deleted_at populated. Billing records and conversation history stay
-- intact and queryable. Every product query that surfaces departments or
-- agents filters `deleted_at IS NULL`: the agents-side reads already did, and
-- the two department-read sites (the rail/breadcrumb list and the launchpad
-- slug lookup) plus the two create-agent department lookups are updated to
-- filter in this same commit.
--
-- sort_order is resequenced on the remaining 11 active departments so the
-- active set is contiguous 1..11. The two soft-deleted departments keep their
-- old sort_order values (harmless — they're filtered out before sort_order
-- matters).
--
-- Notes:
--   - departments already carries an `is_active` column from 0001, but no
--     read path filters on it, so it is dormant. We use `deleted_at` here to
--     match the established agents soft-delete convention (0006/0022/0024)
--     and the read filter (`deleted_at IS NULL`) used everywhere agents are
--     surfaced. is_active is intentionally left untouched.
--   - No index on departments.deleted_at: the table holds ~13 rows, so a
--     partial index (as agents has) would be pure overhead here.
--   - RLS is unchanged. departments RLS admits every org member to read every
--     row; the deleted_at filter lives in the application layer, exactly as
--     it does for agents.
--
-- Idempotent: `add column if not exists` plus the `and deleted_at is null`
-- guards make every statement a no-op on re-run once applied. The resequence
-- rewrites the same sort_order values with a fresh updated_at.

begin;

-- Add the soft-delete column, matching agents.deleted_at (0006): nullable
-- timestamptz, no default (null = active).
alter table public.departments add column if not exists deleted_at timestamptz;

-- Soft-delete the 3 agents that live in the target departments. Resolves the
-- department ids by slug (the two rows still exist; they are soft-deleted
-- below, not removed) so this works regardless of statement order.
update public.agents
set deleted_at = now(),
    updated_at = now()
where department_id in (
  select id from public.departments where slug in ('compliance', 'public-sector')
)
and deleted_at is null;

-- Soft-delete the 2 departments.
update public.departments
set deleted_at = now(),
    updated_at = now()
where slug in ('compliance', 'public-sector')
and deleted_at is null;

-- Resequence the remaining active departments (deleted_at is null) so
-- sort_order is contiguous 1..11. Operations and General Tools stay last in
-- that order per the locked taxonomy rule (commit 7eb776b). No UNIQUE
-- constraint on sort_order, so direct assignment is safe even though two
-- rows transiently share a value with the soft-deleted pair.
update public.departments set sort_order = 1,  updated_at = now() where slug = 'commercial'    and deleted_at is null;
update public.departments set sort_order = 2,  updated_at = now() where slug = 'corporate'     and deleted_at is null;
update public.departments set sort_order = 3,  updated_at = now() where slug = 'regulatory'    and deleted_at is null;
update public.departments set sort_order = 4,  updated_at = now() where slug = 'privacy'       and deleted_at is null;
update public.departments set sort_order = 5,  updated_at = now() where slug = 'ai-governance' and deleted_at is null;
update public.departments set sort_order = 6,  updated_at = now() where slug = 'product'       and deleted_at is null;
update public.departments set sort_order = 7,  updated_at = now() where slug = 'employment'    and deleted_at is null;
update public.departments set sort_order = 8,  updated_at = now() where slug = 'ip'            and deleted_at is null;
update public.departments set sort_order = 9,  updated_at = now() where slug = 'litigation'    and deleted_at is null;
update public.departments set sort_order = 10, updated_at = now() where slug = 'operations'    and deleted_at is null;
update public.departments set sort_order = 11, updated_at = now() where slug = 'general-tools' and deleted_at is null;

commit;
