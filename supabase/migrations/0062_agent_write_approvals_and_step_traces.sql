-- ============================================================================
-- 0062_agent_write_approvals_and_step_traces.sql
-- Workflows delight pass D2 — agent-proposed write approvals + step tool traces
-- ============================================================================
--
-- D1 made the headless agent loop PAUSABLE on a proposed write; D2 wires it
-- into the workflow engine. Two additive changes:
--
--   1. workflow_pending_approvals.kind gains 'agent_write' — an AGENT-PROPOSED
--      write is modeled as its own kind, distinct from an explicitly-authored
--      tool_action 'write', because it behaves differently: its pending_action
--      carries the agent's resumable loop state alongside the proposed call,
--      and DENYING it lets the agent finish gracefully while the RUN CONTINUES
--      (a tool_action deny still cancels the run). Honest kinds keep the
--      approval audit unambiguous. For an 'agent_write', pending_action is
--      { pendingWrite: { toolUseId, name, route, input, argKeys }, pauseState }
--      — route.tokenRef is a POINTER into connection_secrets; NO token is ever
--      written here (re-resolved live by executeMcpTool on resume), and
--      pauseState is the owner's own run data, exactly like
--      mcp_paused_runs.loop_state.
--
--   2. workflow_step_runs gains tool_calls jsonb — the step's PII-safe
--      tool-call trace (argKeys-style entries, mirroring messages.tool_calls):
--      an agent step's reads, and any writes with their approved/denied
--      provenance. Closes the audit gap where an agent step's tool activity
--      was discarded. Null for steps with no tool activity.
--
-- DEPLOY ORDERING: requires 0060 + 0061. Apply BEFORE running workflows whose
-- agents propose writes: without it, an agent-step pause cannot persist its
-- pending approval (the kind check rejects 'agent_write'). The tool-call trace
-- degrades gracefully pre-migration (the code retries step-row writes without
-- tool_calls on undefined_column, so the core audit trail still records).
-- Everything outside the Workflows surface is byte-identical either way.
-- Apply in the Supabase SQL Editor (the project's standard path).
-- ============================================================================


-- ============================================================================
-- workflow_pending_approvals.kind — allow 'agent_write'
-- ============================================================================

alter table public.workflow_pending_approvals
  drop constraint workflow_pending_approvals_kind_check;

alter table public.workflow_pending_approvals
  add constraint workflow_pending_approvals_kind_check
  check (kind in ('checkpoint', 'write', 'agent_write'));

comment on column public.workflow_pending_approvals.pending_action is
  'For a write: the resolved route (serverId / connectionId / token_ref / serverUrl / originalToolName), the toolInput, and the toolUseId. For an agent_write: { pendingWrite: { toolUseId, name, route, input, argKeys }, pauseState } — the agent''s proposed call (full args, for the approval card''s optional show-content disclosure) plus its resumable loop state. For a checkpoint: the prompt/context to show the approver. token_ref is always a POINTER, never a token (re-resolved live on resume).';


-- ============================================================================
-- workflow_step_runs.tool_calls — the per-step tool-call trace (audit)
-- ============================================================================

alter table public.workflow_step_runs
  add column tool_calls jsonb;

comment on column public.workflow_step_runs.tool_calls is
  'The step''s PII-safe tool-call trace (argKeys-style entries, mirroring messages.tool_calls): an agent step''s reads and, with approved/denied provenance, its writes. Null for steps with no tool activity. RLS rides the existing row policies (owner full access; org admins read).';


-- ============================================================================
-- Done.
-- ============================================================================
-- Verification (run in the SQL Editor after applying):
--
--   -- kind constraint now admits agent_write
--   select pg_get_constraintdef(oid)
--   from pg_constraint
--   where conname = 'workflow_pending_approvals_kind_check';
--   -- expect: CHECK (kind = ANY (ARRAY['checkpoint', 'write', 'agent_write'] ...))
--
--   -- trace column present (nullable jsonb)
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'workflow_step_runs' and column_name = 'tool_calls';
--   -- expect: one row, jsonb, YES
--
--   -- RLS unchanged (no new tables; both changes ride existing policies)
--   select polname from pg_policy
--   where polrelid = 'public.workflow_step_runs'::regclass order by polname;
--   -- expect: workflow_step_runs_admin_read, workflow_step_runs_owner
--
--   -- NO secret columns (sanity: only token_ref pointers live inside the jsonb)
--   -- expect NO column named token / access_token / secret.
-- ============================================================================
