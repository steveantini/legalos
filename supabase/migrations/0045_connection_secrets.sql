-- ============================================================================
-- 0045_connection_secrets.sql
-- Connector hub arc, Milestone 4a — encrypted OAuth token storage
-- ============================================================================
--
-- The connections table (migration 0044) holds only a token_ref, never the raw
-- OAuth tokens. This table is where the encrypted token bundle actually lives.
-- One row per connection's secret; connections.token_ref holds this row's id.
--
-- The ciphertext is AES-256-GCM, encrypted at the application layer with the
-- CONNECTION_TOKEN_ENCRYPTION_KEY server-only env var (see lib/connections/
-- crypto.ts). The key is NEVER in the database, matching database-security.md
-- ("encryption keys in a secrets manager, not in the database"). Supabase Vault
-- was not adopted: application-level AES keeps the encryption boundary fully in
-- our control, needs no extension, and matches the project's hand-applied
-- migration workflow.
--
-- Security model: RLS is enabled AND forced, with NO policies. That denies
-- every access to the anon and authenticated roles (and even the table owner).
-- The ONLY access path is the Supabase service-role key, which bypasses RLS and
-- is used server-side exclusively (lib/supabase/admin.ts). No client query can
-- ever read a token. See D-065.
--
-- Apply in the Supabase SQL Editor (the project's standard migration path).
-- ============================================================================


-- ============================================================================
-- Table: connection_secrets
-- ============================================================================

create table public.connection_secrets (
  id          uuid primary key default gen_random_uuid(),
  ciphertext  text not null,   -- AES-256-GCM as "ivHex:authTagHex:cipherHex"; NEVER plaintext
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.connection_secrets is
  'Encrypted OAuth token bundles for connections. connections.token_ref points here. RLS is enabled and forced with no policies, so only the service-role key (server-side) can read or write. The raw token never lives in the connections table, never reaches the client, and is never logged.';
comment on column public.connection_secrets.ciphertext is
  'AES-256-GCM ciphertext of the JSON token bundle (access token, refresh token, expiry, scope), formatted ivHex:authTagHex:cipherHex. The encryption key (CONNECTION_TOKEN_ENCRYPTION_KEY) is a server-only env var, never stored in the database.';

create trigger connection_secrets_updated_at
  before update on public.connection_secrets
  for each row execute function public.set_updated_at();

-- Enable AND force RLS, then declare no policies: every non-service-role access
-- is denied. force is what stops even the table owner from bypassing.
alter table public.connection_secrets enable row level security;
alter table public.connection_secrets force row level security;


-- ============================================================================
-- Done.
-- ============================================================================
-- Verification (run in the SQL Editor after applying):
--
--   -- 1. Table exists with the expected columns:
--   select column_name, data_type
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'connection_secrets'
--   order by ordinal_position;
--
--   -- 2. RLS is enabled AND forced (both must be true):
--   select relrowsecurity, relforcerowsecurity
--   from pg_class
--   where oid = 'public.connection_secrets'::regclass;
--
--   -- 3. No policies exist (expect zero rows):
--   select policyname from pg_policies
--   where schemaname = 'public' and tablename = 'connection_secrets';
-- ============================================================================
