-- ============================================================================
-- 0067_platform_analytics_views.sql
-- Analytics arc, Step 1 — cross-tenant platform-owner analytics views
-- ============================================================================
--
-- Three read-only aggregate VIEWS for the platform-owner analytics surface
-- (/workspace/platform/analytics). They aggregate ACROSS organizations — the
-- cross-tenant adoption/engagement-health lens — so they intentionally bypass
-- Row-Level Security, and are locked to the service role.
--
-- SECURITY MODEL (read this before changing anything):
--
--   * A view in `public` runs with the VIEW OWNER's privileges by default
--     (security_invoker = OFF). That is exactly what cross-tenant aggregation
--     needs: it reads usage_events / users / agents / organizations WITHOUT
--     applying the caller's RLS, so it can count across every org. We therefore
--     deliberately do NOT set `security_invoker = on` (doing so would re-apply
--     RLS and collapse every other org's rows to zero). This is a conscious
--     departure from the usual "use security_invoker = true on views" guidance
--     (database-security.md), justified by the cross-tenant purpose.
--
--   * Because the view bypasses RLS, the table-level GRANT is the ONLY lock.
--     Supabase's default privileges would otherwise expose a new public view to
--     `anon` and `authenticated` (the well-known footgun: an RLS-bypassing view
--     readable by any logged-in user). So for EACH view we REVOKE ALL from
--     anon + authenticated and GRANT SELECT to service_role only. The app reads
--     these views exclusively through the server-only service-role admin client
--     (lib/supabase/admin.ts), behind requirePlatformOwner() — three independent
--     layers (locked view + server-only client + platform-owner route gate).
--
-- DEMO EXCLUSION: every view filters `organizations.is_demo = false` (migration
-- 0064) so the demo sandbox never inflates real adoption numbers. The filter is
-- a single, clearly-isolated predicate per view, on purpose: a future
-- "include demo" variant is the same view minus that one line (e.g. a parallel
-- operator_*_all view), not a rewrite. is_demo is never hard-welded into the
-- aggregation itself.
--
-- WINDOW: a fixed rolling 30-day window (now() is evaluated per query, so the
-- window is always current). If the window ever needs to be selectable, the
-- clean paths are (a) a SQL set-returning function taking N, or (b) deriving the
-- per-day series in the app from operator_usage_daily; do NOT add a service-role
-- metrics API route to satisfy a client toggle (see DECISION_LOG D-140).
--
-- SCALE: at many organizations these per-query aggregations stay cheap because
-- usage_events is indexed on (organization_id, created_at) (migration 0004).
-- If the org count ever grows large enough that the hero feels slow, promote
-- these to a daily-rollup table or a materialized view refreshed on a cron;
-- premature now (single real org + demo).
--
-- Apply in the Supabase SQL Editor (the project's standard migration path).
-- Additive: no existing object is altered; nothing in the deployed app reads
-- these views until the Analytics surface ships, and the reader tolerates their
-- absence (renders a calm empty state, never a 500), so deploy order is free.
-- ============================================================================


-- ============================================================================
-- View 1: operator_org_health — the centerpiece (one row per REAL org)
-- ============================================================================
-- The churn early-warning table: per customer, how activated and engaged they
-- are, and how recently they were active. last_activity_at is intentionally
-- UNBOUNDED (all-time max) so an org last active 90 days ago still reports that
-- date — that "went quiet" recency is the whole point of the row.

create or replace view public.operator_org_health as
with
-- Distinct users active in the trailing 30-day window (the activation numerator).
active_30 as (
  select organization_id, count(distinct user_id) as active_users_30d
  from public.usage_events
  where created_at >= now() - interval '30 days'
  group by organization_id
),
-- Run counts for the current and prior 30-day windows (the engagement trend),
-- plus the all-time last-activity timestamp (the quiet/at-risk signal).
runs as (
  select
    organization_id,
    count(*) filter (where created_at >= now() - interval '30 days') as runs_30d,
    count(*) filter (
      where created_at >= now() - interval '60 days'
        and created_at <  now() - interval '30 days'
    ) as runs_prior_30d,
    max(created_at) as last_activity_at
  from public.usage_events
  group by organization_id
),
-- Seats = active members of the org (the activation denominator).
seats as (
  select organization_id, count(*) as seats
  from public.users
  where is_active = true
  group by organization_id
),
-- Adoption gap: active agents that exist vs. how many have ever been run.
agents_all as (
  select organization_id, count(*) as agents_total
  from public.agents
  where is_active = true and deleted_at is null
  group by organization_id
),
agents_used as (
  select a.organization_id, count(*) as agents_run
  from public.agents a
  where a.is_active = true and a.deleted_at is null
    and exists (
      select 1 from public.usage_events u where u.agent_id = a.id
    )
  group by a.organization_id
)
select
  o.id                                              as organization_id,
  o.name                                            as name,
  coalesce(s.seats, 0)                              as seats,
  coalesce(a.active_users_30d, 0)                   as active_users_30d,
  case
    when coalesce(s.seats, 0) > 0
      then round(coalesce(a.active_users_30d, 0)::numeric / s.seats, 4)
    else 0
  end                                               as activation_rate,
  coalesce(r.runs_30d, 0)                           as runs_30d,
  coalesce(r.runs_prior_30d, 0)                     as runs_prior_30d,
  coalesce(r.runs_30d, 0) - coalesce(r.runs_prior_30d, 0) as runs_delta,
  r.last_activity_at                                as last_activity_at,
  coalesce(at.agents_total, 0)                      as agents_total,
  coalesce(at.agents_total, 0) - coalesce(au.agents_run, 0) as agents_never_run
from public.organizations o
left join active_30  a  on a.organization_id  = o.id
left join runs       r  on r.organization_id  = o.id
left join seats      s  on s.organization_id  = o.id
left join agents_all at on at.organization_id = o.id
left join agents_used au on au.organization_id = o.id
where o.is_demo = false   -- DEMO EXCLUSION (one-line predicate; see header)
order by o.name asc;

comment on view public.operator_org_health is
  'Cross-tenant adoption/engagement health, one row per non-demo org. Aggregates across orgs (bypasses RLS via owner-rights); locked to service_role. Read only via the server-only admin client behind requirePlatformOwner().';

revoke all on public.operator_org_health from anon, authenticated;
grant select on public.operator_org_health to service_role;


-- ============================================================================
-- View 2: operator_usage_daily — cross-tenant usage pulse (timeseries)
-- ============================================================================
-- One row per day for the last 30 days, gap-filled (days with no activity show
-- as zero rather than vanishing, so the line never connects across a missing
-- day). Demo excluded.

create or replace view public.operator_usage_daily as
with days as (
  select generate_series(
    (now() - interval '29 days')::date,
    now()::date,
    interval '1 day'
  )::date as day
),
agg as (
  select
    date_trunc('day', u.created_at)::date as day,
    count(*)                              as runs,
    count(distinct u.user_id)             as active_users,
    count(distinct u.organization_id)     as active_orgs
  from public.usage_events u
  join public.organizations o on o.id = u.organization_id
  where o.is_demo = false   -- DEMO EXCLUSION
    and u.created_at >= (now() - interval '29 days')::date
  group by 1
)
select
  d.day                       as day,
  coalesce(a.runs, 0)         as runs,
  coalesce(a.active_users, 0) as active_users,
  coalesce(a.active_orgs, 0)  as active_orgs
from days d
left join agg a on a.day = d.day
order by d.day asc;

comment on view public.operator_usage_daily is
  'Cross-tenant daily usage pulse for the last 30 days, gap-filled, demo excluded. Service-role only; bypasses RLS by design.';

revoke all on public.operator_usage_daily from anon, authenticated;
grant select on public.operator_usage_daily to service_role;


-- ============================================================================
-- View 3: operator_usage_summary — scalar hero stat-row (single row)
-- ============================================================================
-- Always returns exactly one row (scalar subqueries), so the stat-row renders
-- calm zeros rather than an empty state when there's no usage. Cost is summed
-- in micro-USD (1,000,000 = $1); the app divides for display. Demo excluded.

create or replace view public.operator_usage_summary as
select
  (
    select count(distinct u.organization_id)
    from public.usage_events u
    join public.organizations o on o.id = u.organization_id
    where o.is_demo = false and u.created_at >= now() - interval '30 days'
  ) as active_orgs,
  (
    select count(distinct u.user_id)
    from public.usage_events u
    join public.organizations o on o.id = u.organization_id
    where o.is_demo = false and u.created_at >= now() - interval '30 days'
  ) as active_users_30d,
  (
    select count(*)
    from public.usage_events u
    join public.organizations o on o.id = u.organization_id
    where o.is_demo = false and u.created_at >= now() - interval '30 days'
  ) as runs_30d,
  (
    select coalesce(sum(u.cost_micro_usd), 0)
    from public.usage_events u
    join public.organizations o on o.id = u.organization_id
    where o.is_demo = false and u.created_at >= now() - interval '30 days'
  ) as cost_micro_usd_30d;

comment on view public.operator_usage_summary is
  'Cross-tenant 30-day scalar summary (active orgs, active users, runs, cost in micro-USD), demo excluded. Service-role only; bypasses RLS by design.';

revoke all on public.operator_usage_summary from anon, authenticated;
grant select on public.operator_usage_summary to service_role;


-- Tell PostgREST to pick up the new views immediately (Supabase reloads on DDL,
-- but this makes it deterministic so the surface works right after apply).
notify pgrst, 'reload schema';


-- ============================================================================
-- Done.
-- ============================================================================
-- Verification (run in the SQL Editor after applying):
--
--   -- 1. All three views exist:
--   select table_name from information_schema.views
--   where table_schema = 'public' and table_name like 'operator_%'
--   order by table_name;
--   -- expect: operator_org_health, operator_usage_daily, operator_usage_summary
--
--   -- 2. They are LOCKED: anon + authenticated have NO select; service_role does.
--   select
--     has_table_privilege('anon',          'public.operator_org_health', 'SELECT') as anon_can_read,
--     has_table_privilege('authenticated', 'public.operator_org_health', 'SELECT') as auth_can_read,
--     has_table_privilege('service_role',  'public.operator_org_health', 'SELECT') as service_can_read;
--   -- expect: false, false, true  (repeat for the other two views)
--
--   -- 3. security_invoker is OFF (owner-rights) — required for cross-tenant aggregation:
--   select c.relname, c.reloptions
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relname like 'operator_%';
--   -- expect: reloptions NULL (no security_invoker=on) on all three
--
--   -- 4. Demo is excluded and real-org rows look sensible:
--   select organization_id, name, seats, active_users_30d, activation_rate,
--          runs_30d, runs_delta, last_activity_at, agents_total, agents_never_run
--   from public.operator_org_health;
--   -- expect: the real org "Your Company, Inc." present; the Demo Org ABSENT.
--
--   select * from public.operator_usage_summary;            -- one row of 30-day totals
--   select day, runs from public.operator_usage_daily;      -- 30 gap-filled daily rows
-- ============================================================================
--
-- Rollback (if ever needed):
--   drop view if exists public.operator_usage_summary;
--   drop view if exists public.operator_usage_daily;
--   drop view if exists public.operator_org_health;
-- ============================================================================
