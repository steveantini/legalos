-- ============================================================================
-- legalOS
-- Migration 0030 — Filter corporate-legal configuration-pattern skills
--                   plus the ai-tool-handoff router helper
-- ============================================================================
--
-- Soft-deletes four skills imported from the C4L corporate-legal plugin
-- that don't fit the chat-with-an-agent shape:
--
--   - cold-start-interview   — onboarding (configuration pattern)
--   - customize              — reconfiguration (configuration pattern)
--   - matter-workspace       — client-matter management tool
--   - ai-tool-handoff        — skill-to-skill delegation helper;
--                              belongs in Workflows (second flavor of
--                              "router skills" — distinct from
--                              commercial-legal's user-facing `review`
--                              router, but same Workflows destination).
--
-- The first three match the canonical patterns documented in
-- docs/C4L_DEFERRED_SKILLS.md from prior plugin imports. The fourth
-- (ai-tool-handoff) refines the "router skills" pattern to acknowledge
-- skill-to-skill delegation as a second router flavor — see the
-- pattern-note section in that doc.
--
-- Soft-delete (is_active = false, deleted_at = now()) preserves the
-- source_origin lineage so the future sync pipeline (Shape B) can use
-- the filtered state as a signal to skip re-importing — without
-- overwriting the operator's filtering choice.
--
-- See docs/C4L_DEFERRED_SKILLS.md for per-skill destination notes.
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
         'claude-for-legal:corporate-legal/cold-start-interview',
         'claude-for-legal:corporate-legal/customize',
         'claude-for-legal:corporate-legal/matter-workspace',
         'claude-for-legal:corporate-legal/ai-tool-handoff'
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
--          'claude-for-legal:corporate-legal/cold-start-interview',
--          'claude-for-legal:corporate-legal/customize',
--          'claude-for-legal:corporate-legal/matter-workspace',
--          'claude-for-legal:corporate-legal/ai-tool-handoff'
--        );
-- commit;
-- ============================================================================
