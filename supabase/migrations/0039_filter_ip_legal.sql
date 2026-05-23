-- ============================================================================
-- legalOS
-- Migration 0039 — Filter ip-legal configuration-pattern skills
-- ============================================================================
--
-- Soft-deletes three skills imported from the C4L ip-legal plugin
-- that don't fit the chat-with-an-agent shape:
--
--   - cold-start-interview   — onboarding (configuration pattern)
--   - customize              — reconfiguration (configuration pattern)
--   - matter-workspace       — client-matter management tool
--
-- All three match canonical filter patterns documented in
-- docs/C4L_DEFERRED_SKILLS.md.
--
-- Notable: this plugin contains no reference/framework skills
-- (pattern #5) — second plugin where pattern #5 is absent
-- (ai-governance-legal was the first). The pattern is real but not
-- universal across C4L plugins.
--
-- Also notable: this plugin has a `logs/` directory at its top level
-- (first observed). Silently skipped by the import script, like
-- `agents/` and `data/`. Documented in C4L_DEFERRED_SKILLS.md.
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
         'claude-for-legal:ip-legal/cold-start-interview',
         'claude-for-legal:ip-legal/customize',
         'claude-for-legal:ip-legal/matter-workspace'
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
--          'claude-for-legal:ip-legal/cold-start-interview',
--          'claude-for-legal:ip-legal/customize',
--          'claude-for-legal:ip-legal/matter-workspace'
--        );
-- commit;
-- ============================================================================
