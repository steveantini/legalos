-- ============================================================================
-- legalOS
-- Migration 0032 — Filter employment-legal configuration-pattern skills
--                   plus the two reference/framework skills
-- ============================================================================
--
-- Soft-deletes five skills imported from the C4L employment-legal plugin
-- that don't fit the chat-with-an-agent shape:
--
--   - cold-start-interview     — onboarding (configuration pattern)
--   - customize                — reconfiguration (configuration pattern)
--   - matter-workspace         — client-matter management tool
--   - internal-investigation   — reference/framework (new pattern #5);
--                                user-invocable: false; loaded by
--                                investigation-open / -add / -query /
--                                -memo / -summary as shared library
--   - international-expansion  — reference/framework (new pattern #5);
--                                user-invocable: false; loaded by
--                                expansion-kickoff / -update
--
-- The first three match canonical patterns from prior plugin imports.
-- The last two introduce pattern #5 in the filter taxonomy: skills
-- explicitly marked `user-invocable: false` that are shared library
-- code loaded into other skills rather than invoked directly by users.
-- See docs/C4L_DEFERRED_SKILLS.md → "Pattern note (revised after
-- employment-legal import)" for the full taxonomy.
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
         'claude-for-legal:employment-legal/cold-start-interview',
         'claude-for-legal:employment-legal/customize',
         'claude-for-legal:employment-legal/matter-workspace',
         'claude-for-legal:employment-legal/internal-investigation',
         'claude-for-legal:employment-legal/international-expansion'
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
--          'claude-for-legal:employment-legal/cold-start-interview',
--          'claude-for-legal:employment-legal/customize',
--          'claude-for-legal:employment-legal/matter-workspace',
--          'claude-for-legal:employment-legal/internal-investigation',
--          'claude-for-legal:employment-legal/international-expansion'
--        );
-- commit;
-- ============================================================================
