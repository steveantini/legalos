-- ============================================================================
-- legalOS
-- Migration 0027 — Filter product-legal configuration-pattern skills
-- ============================================================================
--
-- Soft-deletes the three configuration-pattern skills imported from the
-- C4L product-legal plugin:
--
--   - cold-start-interview   — onboarding skill (configuration)
--   - customize              — reconfiguration skill (configuration)
--   - matter-workspace       — client-matter management tool
--
-- All three match the canonical filter patterns documented in
-- docs/C4L_DEFERRED_SKILLS.md (Pattern note, revised after privacy-legal
-- import) — they aren't chat-with-an-agent shaped. Same shape as the
-- filtered skills in commercial-legal (migration 0024 + retroactive
-- 0026) and privacy-legal (migration 0026).
--
-- Soft-delete (is_active = false, deleted_at = now()) preserves the
-- source_origin lineage so the future sync pipeline (Shape B) can use
-- the filtered state as a signal to skip re-importing — without
-- overwriting the operator's filtering choice.
--
-- See docs/C4L_DEFERRED_SKILLS.md for per-skill destination notes.
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
         'claude-for-legal:product-legal/cold-start-interview',
         'claude-for-legal:product-legal/customize',
         'claude-for-legal:product-legal/matter-workspace'
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
--          'claude-for-legal:product-legal/cold-start-interview',
--          'claude-for-legal:product-legal/customize',
--          'claude-for-legal:product-legal/matter-workspace'
--        );
-- commit;
-- ============================================================================
