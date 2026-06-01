-- ============================================================================
-- 0047_organizations_default_model.sql
-- Admin milestone A2b — the org-level default model
-- ============================================================================
--
-- Adds a single nullable column, public.organizations.default_model, holding the
-- model new agents start with org-wide. Nullable by design: unset means "no org
-- choice yet," and the application falls back to the canonical default constant
-- (DEFAULT_MODEL_FALLBACK in lib/llm/models.ts, currently anthropic/claude-opus-4-8).
--
-- No CHECK constraint on the value. Validation is app-level (the canonical models
-- source in lib/llm/models.ts feeds both the save action's z.enum and every model
-- picker), so the model set can grow — including future connection-derived models
-- (models-as-a-connection) — without a constraint migration each time. A rigid DB
-- enum here would have to be altered on every model addition; keeping it text +
-- app validation matches the project's model-agnostic posture.
--
-- RLS: no new policies. The organizations table already carries
-- organizations_read_own (any authenticated member reads their own org's row) and
-- organizations_super_admin_write (super_admin only writes), both from
-- 0001_initial_schema.sql. The new column inherits exactly the read/write posture
-- A2b needs — in-org read, super-admin write — so there is nothing to add here.
--
-- Apply ordering (safe pre-apply): the application code reads default_model
-- tolerantly (getOrganizationDefaultModel treats a missing column / 42703 as
-- "unset" and falls back to the canonical default), so the deployed code is
-- correct whether or not this migration has been applied. The save control writes
-- the column, so applying this migration before using the Policy & access default-
-- model picker is required for saving to succeed; reads and agent creation work
-- either way.
--
-- Apply in the Supabase SQL Editor (the project's standard migration path).
-- Idempotent via add-column-if-not-exists.
-- ============================================================================

begin;

alter table public.organizations
  add column if not exists default_model text;

comment on column public.organizations.default_model is
  'Org-wide default model for NEW agents (vendor-prefixed id, e.g. anthropic/claude-opus-4-8). Nullable: null means no org choice yet and the app falls back to the canonical default (lib/llm/models.ts DEFAULT_MODEL_FALLBACK). No CHECK by design — validation is app-level so the model set (including future connection-derived models) can grow without a constraint migration. Affects agent creation only; existing conversations keep their frozen model_snapshot. Edited super-admin-only via Policy & access (A2b), enforced by the existing organizations_super_admin_write RLS.';

commit;

-- ============================================================================
-- Reverse (only if needed):
--
--   begin;
--     alter table public.organizations drop column if exists default_model;
--   commit;
--
-- Dropping the column reverts every org to the canonical default fallback; no
-- agent rows are affected (agents.model is set at create time and is independent
-- of this column).
-- ============================================================================
