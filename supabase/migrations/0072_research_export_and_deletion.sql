-- ============================================================================
-- 0072_research_export_and_deletion.sql
-- Knowledge arc — research runs become managed artifacts: deletable, and
-- exportable through the existing formatted_outputs pipeline
-- ============================================================================
--
-- Two concerns:
--
--   1. EXPORT. formatted_outputs (0007) was built message-shaped:
--      conversation_id and message_id are NOT NULL, and the write policy is
--      conversation-bound. A research-run export has neither. This relaxes
--      both columns to nullable, adds research_run_id (ON DELETE SET NULL —
--      the export audit row survives run deletion, like the usage ledger),
--      and widens the write policy to accept either anchor: a message export
--      bound to the user's own conversation, or a research export bound to
--      the user's own run. Existing message-export behavior is unchanged.
--
--   2. DELETION. The asker deletes their own runs (the 0071 owner-write
--      policy already covers this); org and super admins may delete any of
--      the organization's runs, mirroring read visibility — that needs a new
--      admin DELETE policy. Findings cascade with the run (0071 FK).
--      usage_events rows SURVIVE: cost records are accounting facts, and
--      usage_events.research_run_id has been ON DELETE SET NULL since 0071 —
--      verified below, no change needed.
--
-- ORDERING + IDEMPOTENCY (the 0070 lessons): column changes first, then
-- policies; IF NOT EXISTS / drop-then-create policies throughout, so a
-- partial apply reruns cleanly. Apply in the Supabase SQL Editor.
-- ============================================================================


-- ============================================================================
-- PART 1 — formatted_outputs: accept research-run exports
-- ============================================================================

-- A research export has no conversation or message. Nullable is safe for the
-- existing message path, which always supplies both.
alter table public.formatted_outputs
  alter column conversation_id drop not null;
alter table public.formatted_outputs
  alter column message_id drop not null;

-- The research anchor. SET NULL on run deletion: the export audit row is a
-- record that an export happened, and deleting the run must not erase it.
alter table public.formatted_outputs
  add column if not exists research_run_id uuid references public.research_runs (id) on delete set null;

create index if not exists formatted_outputs_research_run_id_idx
  on public.formatted_outputs (research_run_id)
  where research_run_id is not null;

-- Widened write policy: the row must be the user's own and org-fenced, and
-- anchored EITHER to the user's own conversation (the message-export path,
-- byte-identical in effect) OR to the user's own research run.
drop policy if exists formatted_outputs_user_via_conversation on public.formatted_outputs;
create policy formatted_outputs_user_via_conversation
  on public.formatted_outputs
  for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and organization_id = public.current_org_id()
    and (
      (
        conversation_id is not null
        and exists (
          select 1 from public.conversations c
          where c.id = formatted_outputs.conversation_id
            and c.user_id = auth.uid()
        )
      )
      or (
        research_run_id is not null
        and exists (
          select 1 from public.research_runs r
          where r.id = formatted_outputs.research_run_id
            and r.user_id = auth.uid()
        )
      )
    )
  );


-- ============================================================================
-- PART 2 — research_runs: admin deletion (mirrors read visibility)
-- ============================================================================

-- The 0071 owner-write policy already lets the asker delete their own runs.
-- This adds the admin half: org/super admins may DELETE any of the org's
-- runs — deletion only, never UPDATE (admins read and tidy; they don't drive
-- or rewrite someone else's run).
drop policy if exists research_runs_admin_delete on public.research_runs;
create policy research_runs_admin_delete
  on public.research_runs
  for delete
  using (
    organization_id = public.current_org_id()
    and public.current_user_role() in ('super_admin', 'org_admin')
  );


-- ============================================================================
-- Verification (run after applying)
-- ============================================================================
-- 1. formatted_outputs accepts both anchors:
--    select column_name, is_nullable from information_schema.columns
--     where table_name = 'formatted_outputs'
--       and column_name in ('conversation_id', 'message_id', 'research_run_id');
--    -- expect: all three present; conversation_id and message_id YES.
--
-- 2. The ledger survives deletion (confirming 0071, unchanged here):
--    select confdeltype from pg_constraint
--     where conrelid = 'public.usage_events'::regclass
--       and conname like '%research_run_id%';
--    -- expect: 'n' (SET NULL).
--
-- 3. Policies:
--    select policyname from pg_policies where tablename = 'research_runs';
--    -- expect: read, owner write, and admin delete.
--    select policyname from pg_policies where tablename = 'formatted_outputs';
--    -- expect: the widened user policy plus admin read.
