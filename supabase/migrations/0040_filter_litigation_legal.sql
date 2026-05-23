-- ============================================================================
-- legalOS
-- Migration 0040 — Filter litigation-legal configuration-pattern skills
-- ============================================================================
--
-- Soft-deletes three skills imported from the C4L litigation-legal
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
-- (pattern #5) — third plugin where pattern #5 is absent
-- (ai-governance-legal and ip-legal were the first two). Pattern #5
-- prevalence across 9 audited plugins: 6 present, 3 absent (~2/3).
--
-- This plugin introduces tracker form 3 (tracker cluster) — five
-- skills coordinate over a shared state file. The matter-portfolio
-- cluster (matter-intake + matter-update + matter-close +
-- matter-briefing + portfolio-status) IS the matter-portfolio UI
-- waiting to be built; it's the strongest tracker-UI migration
-- candidate across all forms. See the Tracker-shape skills section
-- of docs/C4L_DEFERRED_SKILLS.md.
--
-- The matter-workspace skill filtered here is distinct from the
-- tracker cluster — it's the practice-level workspace manager (same
-- canonical pattern as the matter-workspace skills filtered from
-- prior plugins), not part of the per-matter tracker.
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
         'claude-for-legal:litigation-legal/cold-start-interview',
         'claude-for-legal:litigation-legal/customize',
         'claude-for-legal:litigation-legal/matter-workspace'
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
--          'claude-for-legal:litigation-legal/cold-start-interview',
--          'claude-for-legal:litigation-legal/customize',
--          'claude-for-legal:litigation-legal/matter-workspace'
--        );
-- commit;
-- ============================================================================
