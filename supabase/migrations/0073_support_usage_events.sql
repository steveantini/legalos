-- ============================================================================
-- 0073: the support assistant's usage ledger (D-160)
--
-- The public support assistant (Documentation arc Step 3b) answers anonymous
-- questions on /support. Its Anthropic calls must be ledgered honestly, but
-- they cannot live in usage_events: that table's organization_id and user_id
-- are NOT NULL by design (the customer cost ledger's attribution integrity),
-- and anonymous support traffic has neither an org nor a user. Rather than
-- relax the customer ledger's guarantees, support spend gets its own small
-- sibling table with the same accounting columns and an ephemeral session
-- marker. It is platform overhead (legalOS's own surface on the managed key),
-- so it deliberately does NOT join the per-org cost analytics; a platform
-- analytics view over this table is an additive follow-on.
--
-- RLS is enabled AND forced with NO policies (the connection_secrets idiom):
-- only the server's service-role writes and reads it. No browser session can
-- touch it, and there is no PII in it: session_id is a client-minted random
-- UUID that lives for one visit and is never tied to a person.
--
-- Idempotent: safe to re-run.
-- ============================================================================

create table if not exists public.support_usage_events (
  id                     uuid primary key default gen_random_uuid(),
  -- The visitor's ephemeral, client-minted session id. Anonymous by
  -- construction; exists only to make per-session volume visible.
  session_id             uuid not null,
  model                  text not null,
  tokens_in              integer not null,
  tokens_out             integer not null,
  cache_creation_tokens  integer not null default 0,
  cache_read_tokens      integer not null default 0,
  cost_micro_usd         bigint not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists support_usage_events_created_at_idx
  on public.support_usage_events (created_at);

drop trigger if exists support_usage_events_updated_at on public.support_usage_events;
create trigger support_usage_events_updated_at
  before update on public.support_usage_events
  for each row execute function public.set_updated_at();

alter table public.support_usage_events enable row level security;
alter table public.support_usage_events force row level security;
-- No policies on purpose: service-role only.
