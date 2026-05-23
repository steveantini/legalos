-- ============================================================================
-- legalOS
-- Migration 0038 — Filter ai-governance-legal configuration-pattern skills
-- ============================================================================
--
-- Soft-deletes three skills imported from the C4L ai-governance-legal
-- plugin that don't fit the chat-with-an-agent shape:
--
--   - cold-start-interview   — onboarding (configuration pattern)
--   - customize              — reconfiguration (configuration pattern)
--   - matter-workspace       — client-matter management tool
--
-- All three match canonical filter patterns documented in
-- docs/C4L_DEFERRED_SKILLS.md.
--
-- Notable: this plugin contains no reference/framework skills
-- (pattern #5) — the first audited plugin where pattern #5 is absent.
-- Also notable: this plugin has no `agents/` directory at all — the
-- first observed plugin without one. Neither of those facts changes
-- the filter set; just worth flagging in the docs.
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
         'claude-for-legal:ai-governance-legal/cold-start-interview',
         'claude-for-legal:ai-governance-legal/customize',
         'claude-for-legal:ai-governance-legal/matter-workspace'
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
--          'claude-for-legal:ai-governance-legal/cold-start-interview',
--          'claude-for-legal:ai-governance-legal/customize',
--          'claude-for-legal:ai-governance-legal/matter-workspace'
--        );
-- commit;
-- ============================================================================
