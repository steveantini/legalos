-- ============================================================================
-- 0051_byo_model_connection.sql
-- Models-as-a-connection, flag 1c — bring-your-own-key model connections
-- ============================================================================
--
-- Lets an organization store its own encrypted model-provider API key that the
-- chat route uses instead of the managed platform key. A BYO model connection
-- reuses the existing connections + connection_secrets tables (migrations 0044/
-- 0045): an org-scoped connections row (scope='org', owner_user_id null,
-- provider_id=<vendor>, capability_category='models', token_ref → an encrypted
-- key in connection_secrets). No column CHECK on capability_category, so 'models'
-- needs no constraint change; this migration adds only the three columns/indexes
-- that the model-connection representation needs.
--
-- Governance: model connections are NOT routed through the data-source
-- connection_policy gate (isConnectionAllowed); they are governed as their own
-- Policy & access control (the connection's existence — super-admin-created,
-- active, org-scoped — is its authorization). So no connection_policy /
-- allowed_categories / allowed_providers change here (D-087).
--
-- RLS: NO change needed.
--   - Writes to an org connection are already gated to super_admin by
--     connections_org_super_admin_write (scope='org' AND super_admin), migration
--     0044 — exactly the gating a model connection wants.
--   - A grant-less org connection is super_admin-read-only under
--     connections_read_visible, so the chat-route resolver reads it via the
--     service-role admin client (the same client that reads connection_secrets,
--     which is RLS-forced with no policies). Regular users never read the row or
--     the key directly.
--
-- Deploy ordering (chat never breaks): the resolver's BYO branch tolerates these
-- columns being absent (a query error or simply no BYO row → fall back to the
-- managed platform key). So the 1c code can deploy BEFORE this migration is
-- applied with managed behavior unchanged; applying the migration is what makes
-- BYO usable. Safe either order; managed chat is never interrupted.
--
-- Apply in the Supabase SQL Editor (the project's standard migration path).
-- ============================================================================


-- ============================================================================
-- Columns
-- ============================================================================

-- The managed-vs-BYO signal. Null for the existing OAuth/data-source connections
-- (they have no credential-source concept). A model connection is 'byo' when an
-- org key is stored, 'managed' after a non-destructive switch back (the row and
-- the stored key are kept so the org can switch to BYO again without re-entering).
alter table public.connections
  add column credential_source text check (credential_source in ('managed', 'byo'));

comment on column public.connections.credential_source is
  'For model connections: managed = the platform key is used; byo = the org-supplied key in connection_secrets (token_ref) is used. Null for OAuth/data-source connections. The chat-route resolver treats an org as BYO for a vendor only when an active org model connection with credential_source=''byo'' and a token_ref exists; otherwise managed. Switching byo→managed is non-destructive (the key is retained).';

-- Optional provider endpoint override. Unused by managed and by BYO-Anthropic
-- (fixed endpoint); populated for self-hosted (OpenAI-compatible endpoints the
-- customer runs). Flows into the resolver's ModelCredential.baseURL. Added now to
-- avoid a second migration when self-hosted lands.
alter table public.connections
  add column base_url text;

comment on column public.connections.base_url is
  'Optional model-provider API endpoint override (self-hosted/BYO). Null for managed, OAuth connections, and BYO-Anthropic (which uses the provider default). When set, the resolver passes it as the inference client base URL.';


-- ============================================================================
-- Uniqueness — at most one ACTIVE org model connection per vendor
-- ============================================================================
-- Makes the resolver's lookup deterministic and prevents duplicate active BYO
-- connections for a vendor. Partial so it constrains ONLY org model connections
-- that are active; revoked/error rows and personal/data-source connections are
-- unaffected. provider_id is the vendor for a model connection.

create unique index connections_one_active_org_model_per_vendor
  on public.connections (provider_id)
  where scope = 'org' and capability_category = 'models' and status = 'active';


-- ============================================================================
-- Done.
-- ============================================================================
-- Verification (run in the SQL Editor after applying):
--
--   -- 1. The two columns exist with the expected types and the credential_source CHECK:
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'connections'
--     and column_name in ('credential_source', 'base_url')
--   order by column_name;
--
--   -- 2. The credential_source CHECK constraint admits only managed/byo:
--   select pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.connections'::regclass
--     and pg_get_constraintdef(oid) ilike '%credential_source%';
--
--   -- 3. The unique partial index exists:
--   select indexname, indexdef
--   from pg_indexes
--   where schemaname = 'public' and tablename = 'connections'
--     and indexname = 'connections_one_active_org_model_per_vendor';
--
--   -- 4. Existing connections are unaffected (credential_source/base_url null):
--   select count(*) as total,
--          count(credential_source) as with_credential_source,
--          count(base_url) as with_base_url
--   from public.connections;
--   -- expect with_credential_source = 0 and with_base_url = 0 until a BYO key is set.
-- ============================================================================
