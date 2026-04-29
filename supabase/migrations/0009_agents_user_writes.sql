-- ============================================================================
-- legal-department-launchpad-template
-- Migration 0009 — Agents user-write RLS policy
--                   (Phase 2 implementation, Session 8f-A)
-- ============================================================================
--
-- Closes a gap exposed by Session 8f-A planning: 0001's `agents` table only
-- has `agents_admin_write` for INSERT/UPDATE/DELETE, gated on
-- is_department_admin(). Regular users cannot insert agents — every
-- createAgent() call from the new agent CRUD UI would be silently rejected
-- by RLS otherwise.
--
-- This migration adds an INSERT-only policy that lets a user create rows
-- they own, of native type, in departments they have access to. Templates
-- (is_template = true) and external agents (type = 'external') remain
-- writable only by service-role (seed path) or by admins via
-- agents_admin_write — users cannot mint a system template or paste a
-- third-party URL into the launchpad through this policy.
--
-- UPDATE / DELETE for users on their own agents lands in 8f-B (edit + soft
-- delete). This migration is INSERT-only.
--
-- The existing SELECT policies (agents_read_accessible) already let a user
-- read their own newly-created agent because has_department_access() is
-- the gate, not is_template / created_by. No SELECT changes needed.
--
-- Idempotence: DROP POLICY IF EXISTS / CREATE POLICY pattern. Re-running
-- this migration is a no-op.
-- ============================================================================

drop policy if exists agents_user_creates_own on public.agents;
create policy agents_user_creates_own
  on public.agents
  for insert
  with check (
    organization_id = public.current_org_id()
    and created_by = auth.uid()
    and is_template = false
    and type = 'native'
    and is_active = true
    and deleted_at is null
    and public.has_department_access(department_id)
  );

-- ============================================================================
-- Reverse:
--   drop policy if exists agents_user_creates_own on public.agents;
-- ============================================================================
