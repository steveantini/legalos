-- ============================================================================
-- legalOS
-- Migration 0024 — Filter C4L commercial-legal skills not shaped as agents
-- ============================================================================
--
-- After importing all 12 Claude-for-Legal commercial-legal skills via the
-- one-shot import script (commit 27da5e2), three of the imported rows do
-- not fit the department-agent-card UX in legalOS:
--
--   - claude-for-legal:commercial-legal/review
--       A router skill that reads user input, identifies the agreement
--       type, and delegates to the appropriate specialist skill. Multi-
--       step orchestration is the defining shape of a Workflow in
--       legalOS, not an Agent.
--
--   - claude-for-legal:commercial-legal/cold-start-interview
--       C4L's first-run playbook-learning skill. One-shot configuration,
--       not a recurring chat. Belongs in an admin configuration surface.
--
--   - claude-for-legal:commercial-legal/customize
--       Same shape as cold-start-interview. Configuration skill.
--
-- Soft-delete (is_active = false, deleted_at = now()) preserves the row
-- and the source_origin lineage so the future sync pipeline (Shape B)
-- can use the filtered state as a signal to skip re-importing — without
-- overwriting the operator's filtering choice. Hard delete is not used;
-- the rows are still legitimate C4L content and may move to other
-- surfaces (Workflows for `review`, admin configuration for the other
-- two) when those surfaces ship.
--
-- See docs/C4L_DEFERRED_SKILLS.md for the rationale and the eventual
-- destination surfaces.
--
-- Idempotent: `WHERE deleted_at IS NULL` makes re-runs a no-op once the
-- rows are soft-deleted.
-- ============================================================================

begin;

update public.agents
   set is_active  = false,
       deleted_at = now(),
       updated_at = now()
 where source_origin in (
         'claude-for-legal:commercial-legal/review',
         'claude-for-legal:commercial-legal/cold-start-interview',
         'claude-for-legal:commercial-legal/customize'
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
--          'claude-for-legal:commercial-legal/review',
--          'claude-for-legal:commercial-legal/cold-start-interview',
--          'claude-for-legal:commercial-legal/customize'
--        );
-- commit;
-- ============================================================================
