-- ============================================================================
-- legalOS
-- Migration 0025 — Per-user UI and behavior preferences
-- ============================================================================
--
-- Per-user preferences stored as key/value rows, one row per user per
-- key. Each row is independent so concurrent writes don't fight over a
-- shared blob (the alternative — a JSONB column on `public.users` —
-- would force read-modify-write on every preference change, racing
-- between tabs).
--
-- Keys follow a namespaced convention defined in
-- `lib/preferences/keys.ts`:
--   ui:dept:<slug>:collapsed_sections   per-department UI state
--   agent:default_model                  user's preferred default model
--   agent:default_output_format          user's preferred output format
--   chat:show_token_counts               misc client-side toggles
--
-- The DB doesn't enforce key shape — the registry lives in the app and
-- is the single source of truth. Storing values as JSONB accommodates
-- primitives (boolean/string/number) and small structured values
-- (arrays of section ids, etc.) without per-key column types.
--
-- RLS: each user reads and writes only their own rows. No admin
-- override — preferences are private. Service-role bypasses RLS as
-- usual (server actions called from admin-only paths can still write
-- on behalf of a user via service-role if a future surface needs it).
--
-- Idempotent: `create table if not exists` + `drop policy if exists` +
-- `create policy`. Re-running this migration is a no-op.
-- ============================================================================

begin;

create table if not exists public.user_preferences (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  key         text not null,
  value       jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, key)
);

create index if not exists user_preferences_user_id_idx
  on public.user_preferences (user_id);

create index if not exists user_preferences_user_key_idx
  on public.user_preferences (user_id, key);

drop trigger if exists user_preferences_updated_at on public.user_preferences;
create trigger user_preferences_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

alter table public.user_preferences enable row level security;

drop policy if exists user_preferences_owner_read on public.user_preferences;
create policy user_preferences_owner_read
  on public.user_preferences
  for select
  using (user_id = auth.uid());

drop policy if exists user_preferences_owner_insert on public.user_preferences;
create policy user_preferences_owner_insert
  on public.user_preferences
  for insert
  with check (user_id = auth.uid());

drop policy if exists user_preferences_owner_update on public.user_preferences;
create policy user_preferences_owner_update
  on public.user_preferences
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists user_preferences_owner_delete on public.user_preferences;
create policy user_preferences_owner_delete
  on public.user_preferences
  for delete
  using (user_id = auth.uid());

comment on table public.user_preferences is
  'Per-user UI and behavior preferences. Key registry lives in lib/preferences/keys.ts in the application repo.';
comment on column public.user_preferences.key is
  'Namespaced preference key (e.g., "ui:dept:commercial:collapsed_sections"). Validated by application code; not enforced at DB level.';
comment on column public.user_preferences.value is
  'JSONB value. Accommodates primitives and small structured values without per-key column types.';

commit;

-- ============================================================================
-- Reverse:
--
-- begin;
--   drop table if exists public.user_preferences cascade;
-- commit;
-- ============================================================================
