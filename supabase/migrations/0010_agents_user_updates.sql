-- ============================================================================
-- legal-department-launchpad-template
-- Migration 0010 — Agents user-update RLS policy
--                   (Phase 2 implementation, Session 8f-B)
-- ============================================================================
--
-- Adds the UPDATE-side RLS policy for user-owned agents. 0009 covered INSERT
-- (agents_user_creates_own); this migration covers edit, soft-delete, and
-- restore — all of which are UPDATE statements at the database layer.
--
-- A single policy covers all three operations. Postgres doesn't distinguish
-- UPDATEs by which columns changed; the using/with check guards make it
-- impossible to escalate (cannot flip is_template, cannot change created_by,
-- cannot change organization_id) regardless of which "operation" the
-- application thinks it's doing.
--
-- The 30-day undo window is intentionally NOT enforced at the policy. RLS
-- is about who, not when; the application layer (the restoreAgentAction
-- server action and the trash query) gates the time window. Mixing
-- time-based predicates into RLS makes the policy harder to reason about.
--
-- No DELETE policy. Hard delete remains service-role only. Soft-deleted
-- rows beyond 30 days continue to live in the DB until a future cron job
-- (deferred) hard-deletes them; users cannot reach them through the UI.
--
-- The has_department_access guard in the with check has a multi-user
-- consequence worth flagging: if a user loses access to a department, they
-- also lose the ability to soft-delete or restore agents in that
-- department. Not a v1 concern at single-user scale; revisit when
-- department-shared agents land per architecture §1's deferred items.
--
-- Idempotence: drop-and-recreate. Re-running this migration is a no-op.
-- ============================================================================

drop policy if exists agents_user_updates_own on public.agents;
create policy agents_user_updates_own
  on public.agents
  for update
  using (
    created_by = auth.uid()
    and is_template = false
    and type = 'native'
    and organization_id = public.current_org_id()
  )
  with check (
    created_by = auth.uid()
    and is_template = false
    and type = 'native'
    and organization_id = public.current_org_id()
    and public.has_department_access(department_id)
  );

-- ============================================================================
-- Reverse:
--   drop policy if exists agents_user_updates_own on public.agents;
-- ============================================================================
