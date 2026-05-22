-- ============================================================================
-- legalOS
-- Migration 0026 — Filter privacy-legal configuration skills + retroactive
--                   matter-workspace correction across both plugins
-- ============================================================================
--
-- Two coordinated filtering changes after the privacy-legal C4L import:
--
--   1. From privacy-legal, soft-delete the three configuration-pattern
--      skills (same convention as commercial-legal's filtering in
--      migration 0024):
--        - cold-start-interview   — onboarding skill
--        - customize              — reconfiguration skill
--        - matter-workspace       — client-matter management tool
--
--   2. From commercial-legal, RETROACTIVELY soft-delete
--      `matter-workspace`. The original commercial-legal import
--      (commit 27da5e2) kept matter-workspace because the
--      configuration-pattern recognition was incomplete at the time.
--      Re-evaluation during the privacy-legal import surfaced that
--      matter-workspace is a workspace-management tool, not a
--      chat-with-an-agent. Filtering it here brings commercial-legal
--      into line with the now-canonical pattern (see
--      docs/C4L_DEFERRED_SKILLS.md → "Pattern note (revised…)").
--
-- Soft-delete (is_active = false, deleted_at = now()) preserves the
-- source_origin lineage so the future sync pipeline (Shape B) can use
-- the filtered state as a signal to skip re-importing — without
-- overwriting the operator's filtering choice. Hard delete is not used;
-- the rows are still legitimate C4L content and may move to other
-- surfaces (admin configuration / workspace management) when those
-- surfaces ship.
--
-- See docs/C4L_DEFERRED_SKILLS.md for full rationale and per-skill
-- destination notes.
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
         'claude-for-legal:privacy-legal/cold-start-interview',
         'claude-for-legal:privacy-legal/customize',
         'claude-for-legal:privacy-legal/matter-workspace',
         'claude-for-legal:commercial-legal/matter-workspace'
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
--          'claude-for-legal:privacy-legal/cold-start-interview',
--          'claude-for-legal:privacy-legal/customize',
--          'claude-for-legal:privacy-legal/matter-workspace',
--          'claude-for-legal:commercial-legal/matter-workspace'
--        );
-- commit;
-- ============================================================================
