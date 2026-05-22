-- ============================================================================
-- legalOS
-- Migration 0035 — Filter regulatory-legal configuration-pattern skills
--                   plus the gap-surfacer reference/framework skill
-- ============================================================================
--
-- Soft-deletes four skills imported from the C4L regulatory-legal
-- plugin that don't fit the chat-with-an-agent shape:
--
--   - cold-start-interview   — onboarding (configuration pattern)
--   - customize              — reconfiguration (configuration pattern)
--   - matter-workspace       — client-matter management tool
--   - gap-surfacer           — reference/framework (pattern #5);
--                              user-invocable: false; shared library
--                              loaded by `gaps` and `comments` skills
--                              for common state tracking, owner
--                              routing, and Slack notification logic.
--
-- All four match canonical filter patterns documented in
-- docs/C4L_DEFERRED_SKILLS.md. The gap-surfacer entry is the second
-- example of pattern #5 (reference/framework skills) after
-- employment-legal's internal-investigation and international-expansion,
-- confirming the pattern as a stable convention across plugins.
--
-- Side note (also recorded in the docs): regulatory-legal is the first
-- plugin where a reference/framework skill is loaded by tracker-shape
-- skills — `gaps` and `comments` (both tracker form 1) both load
-- gap-surfacer for shared infrastructure. The form 1 tracker
-- description in the docs picks up a clarifying sentence about this.
--
-- Soft-delete (is_active = false, deleted_at = now()) preserves the
-- source_origin lineage so the future sync pipeline (Shape B) can use
-- the filtered state as a signal to skip re-importing — without
-- overwriting the operator's filtering choice.
--
-- Idempotent: `WHERE deleted_at IS NULL` makes re-runs a no-op once
-- the rows are soft-deleted.
-- ============================================================================

begin;

update public.agents
   set is_active  = false,
       deleted_at = now(),
       updated_at = now()
 where source_origin in (
         'claude-for-legal:regulatory-legal/cold-start-interview',
         'claude-for-legal:regulatory-legal/customize',
         'claude-for-legal:regulatory-legal/matter-workspace',
         'claude-for-legal:regulatory-legal/gap-surfacer'
       )
   and deleted_at is null;

commit;

-- ============================================================================
-- Reverse (do not run unless un-filtering — typically only when the
-- target surface for the skill is built and the row is being moved):
--
-- begin;
-- update public.agents
--    set is_active  = true,
--        deleted_at = null,
--        updated_at = now()
--  where source_origin in (
--          'claude-for-legal:regulatory-legal/cold-start-interview',
--          'claude-for-legal:regulatory-legal/customize',
--          'claude-for-legal:regulatory-legal/matter-workspace',
--          'claude-for-legal:regulatory-legal/gap-surfacer'
--        );
-- commit;
-- ============================================================================
