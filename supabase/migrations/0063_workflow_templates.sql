-- ============================================================================
-- 0063_workflow_templates.sql
-- Workflows arc Step 5 — templates as flagged workflow_definitions
-- ============================================================================
--
-- A workflow TEMPLATE is a pre-built, org-specific workflow definition the
-- user FORKS into My Workflows (the fork is a normal, editable, user-owned
-- draft). Templates are stored as workflow_definitions rows — same shape,
-- same validator, same builder-compatible jsonb — flagged by a new status
-- value rather than a separate table. Two additive changes:
--
--   1. status gains 'template'. A template is structurally NOT runnable:
--      executeWorkflowRun requires status = 'active', so the flag itself is
--      the guarantee (fork first, then activate the fork). Using status (not
--      a boolean) keeps one field as the single source of truth for both
--      lifecycle and runnability.
--
--   2. template_slug — a stable per-org key for the idempotent seed
--      (scripts/seed-workflow-templates.ts): re-running the seed updates the
--      existing row instead of duplicating it. Null for every normal
--      workflow; forks deliberately do NOT copy it (a fork is fully owned,
--      with no link back). The unique index relies on Postgres's default
--      NULLS DISTINCT, so unlimited normal workflows coexist.
--
-- This is the Option-A (org-specific) template model: a template references
-- the org's REAL agent ids. A future portable "recipe" model (capability-
-- based, cross-org resolution) is ADDITIVE on top — the seed already keeps
-- its specs agent-SLUG-based and resolves them per org at seed time, which is
-- exactly the resolution seam a recipe would reuse.
--
-- RLS: no new policies. Templates ride the existing workflow_definitions
-- policies — org members read them (they are seeded org-wide with a null
-- department_id), org admins author/fork; the seed runs with the service
-- role, like the C4L import. No secrets: a definition is a declarative step
-- graph (agent ids + plain-language instructions), never credentials.
--
-- DEPLOY ORDERING: requires 0060. Apply BEFORE running the template seed
-- (the seed writes status = 'template' and template_slug). The app is
-- backward-compatible either way: pre-migration, the Template Library simply
-- lists no templates. Apply in the Supabase SQL Editor (the project's
-- standard path).
-- ============================================================================


-- ============================================================================
-- workflow_definitions.status — allow 'template'
-- ============================================================================
-- The original check was declared inline on the column (0060), so it carries
-- the Postgres auto-generated name <table>_<column>_check.

alter table public.workflow_definitions
  drop constraint workflow_definitions_status_check;

alter table public.workflow_definitions
  add constraint workflow_definitions_status_check
  check (status in ('draft', 'active', 'archived', 'template'));

comment on column public.workflow_definitions.status is
  'draft | active | archived | template. Only active definitions can run. A template is a forkable starter (Step 5): never runnable directly — using it copies the definition into a new user-owned draft.';


-- ============================================================================
-- workflow_definitions.template_slug — the idempotent seed key
-- ============================================================================

alter table public.workflow_definitions
  add column template_slug text;

comment on column public.workflow_definitions.template_slug is
  'Stable per-org key for seeded templates (e.g. review-inbound-nda), so the seed script is re-runnable without duplicating. Null for every non-template workflow; forks do not copy it.';

create unique index workflow_definitions_org_template_slug_key
  on public.workflow_definitions (organization_id, template_slug);


-- ============================================================================
-- Done.
-- ============================================================================
-- Verification (run in the SQL Editor after applying):
--
--   -- status constraint now admits template
--   select pg_get_constraintdef(oid)
--   from pg_constraint
--   where conname = 'workflow_definitions_status_check';
--   -- expect: CHECK (status = ANY (ARRAY['draft', 'active', 'archived', 'template'] ...))
--
--   -- template_slug present (nullable text) + its unique index
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'workflow_definitions' and column_name = 'template_slug';
--   -- expect: one row, text, YES
--
--   select indexname from pg_indexes
--   where tablename = 'workflow_definitions'
--     and indexname = 'workflow_definitions_org_template_slug_key';
--   -- expect: one row
--
--   -- RLS unchanged (templates ride the existing policies)
--   select polname from pg_policy
--   where polrelid = 'public.workflow_definitions'::regclass order by polname;
--   -- expect: workflow_definitions_admin_write, workflow_definitions_read
-- ============================================================================
