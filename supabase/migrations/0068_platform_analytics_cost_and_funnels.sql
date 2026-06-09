-- ============================================================================
-- 0068_platform_analytics_cost_and_funnels.sql
-- Analytics arc, Step 2 — platform-owner Cost + Adoption-funnel views
-- ============================================================================
--
-- Six more service-role-locked aggregate views for the platform Analytics
-- surface, on the same pattern as 0067 (read that file's SECURITY MODEL header
-- first). In short: each view runs with owner-rights (security_invoker NOT set)
-- so it aggregates ACROSS organizations bypassing RLS, and the table-level
-- GRANT is the only lock, so each is REVOKEd from anon + authenticated and
-- GRANTed to service_role. Read only through the server-only admin client
-- behind requirePlatformOwner().
--
-- DEMO EXCLUSION: the real-customer views filter `organizations.is_demo = false`
-- on a single isolated predicate (one line to vary later), exactly like 0067.
--
--   * IMPORTANT EXCEPTION — operator_demo_conversion is INTENTIONALLY about the
--     demo funnel itself, so it does NOT apply the is_demo exclusion. Every
--     demo_invitations row belongs to the Demo Org by nature; excluding demo
--     would zero the view out. This is the one view in the analytics set that
--     measures demo activity on purpose. The distinction is flagged at the view.
--
-- COST is shown only at this platform altitude. cost is stored as bigint
-- micro-USD (1,000,000 = $1); the app divides for display.
--
-- SCALE: same note as 0067 — these windowed aggregations use the
-- usage_events (organization_id, created_at) index; promote to a daily rollup /
-- materialized view only if the org count ever makes the page feel slow.
--
-- Apply in the Supabase SQL Editor. Additive; the reader tolerates the views
-- being absent (calm empty tiles, never a 500), so deploy order is free.
-- ============================================================================


-- ============================================================================
-- COST group
-- ============================================================================

-- operator_cost_daily — spend over time (gap-filled 30-day timeseries).
create or replace view public.operator_cost_daily as
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
    coalesce(sum(u.cost_micro_usd), 0)    as cost_micro_usd
  from public.usage_events u
  join public.organizations o on o.id = u.organization_id
  where o.is_demo = false   -- DEMO EXCLUSION
    and u.created_at >= (now() - interval '29 days')::date
  group by 1
)
select
  d.day                          as day,
  coalesce(a.cost_micro_usd, 0)  as cost_micro_usd
from days d
left join agg a on a.day = d.day
order by d.day asc;

comment on view public.operator_cost_daily is
  'Cross-tenant daily spend (micro-USD) for the last 30 days, gap-filled, demo excluded. Service-role only; bypasses RLS by design.';

revoke all on public.operator_cost_daily from anon, authenticated;
grant select on public.operator_cost_daily to service_role;


-- operator_cost_by_org — 30-day spend per real customer, highest first.
create or replace view public.operator_cost_by_org as
select
  o.id   as organization_id,
  o.name as name,
  coalesce(
    sum(u.cost_micro_usd) filter (where u.created_at >= now() - interval '30 days'),
    0
  ) as cost_micro_usd_30d
from public.organizations o
left join public.usage_events u on u.organization_id = o.id
where o.is_demo = false   -- DEMO EXCLUSION
group by o.id, o.name
order by cost_micro_usd_30d desc, o.name asc;

comment on view public.operator_cost_by_org is
  'Cross-tenant 30-day spend (micro-USD) per non-demo org, highest first. Service-role only; bypasses RLS by design.';

revoke all on public.operator_cost_by_org from anon, authenticated;
grant select on public.operator_cost_by_org to service_role;


-- operator_cost_summary — scalar: today, this week, and a naive projected
-- monthly (trailing-30-day spend used directly as the monthly projection, the
-- Kindred approach). The 30-day total itself already lives in
-- operator_usage_summary; this view's distinct add is the projection plus the
-- shorter today/week windows. Always one row. Demo excluded.
create or replace view public.operator_cost_summary as
select
  (
    select coalesce(sum(u.cost_micro_usd), 0)
    from public.usage_events u
    join public.organizations o on o.id = u.organization_id
    where o.is_demo = false and u.created_at >= date_trunc('day', now())
  ) as cost_today_micro_usd,
  (
    select coalesce(sum(u.cost_micro_usd), 0)
    from public.usage_events u
    join public.organizations o on o.id = u.organization_id
    where o.is_demo = false and u.created_at >= now() - interval '7 days'
  ) as cost_week_micro_usd,
  (
    select coalesce(sum(u.cost_micro_usd), 0)
    from public.usage_events u
    join public.organizations o on o.id = u.organization_id
    where o.is_demo = false and u.created_at >= now() - interval '30 days'
  ) as projected_monthly_micro_usd;

comment on view public.operator_cost_summary is
  'Cross-tenant scalar cost summary (today, this week, and trailing-30-day projected monthly), micro-USD, demo excluded. Service-role only; bypasses RLS by design.';

revoke all on public.operator_cost_summary from anon, authenticated;
grant select on public.operator_cost_summary to service_role;


-- ============================================================================
-- ADOPTION-FUNNELS group
-- ============================================================================

-- operator_invite_funnel — invitation acceptance. Effective status mirrors the
-- app (a still-pending invite past its expiry counts as expired). The headline
-- is the acceptance rate over RESOLVED invites (accepted / accepted+revoked+
-- expired); live-pending invites are excluded from the denominator since they
-- have not resolved yet. Always one row. Demo excluded.
create or replace view public.operator_invite_funnel as
with eff as (
  select
    case
      when i.status = 'accepted' then 'accepted'
      when i.status = 'revoked'  then 'revoked'
      when i.status = 'expired'  then 'expired'
      when i.status = 'pending' and i.expires_at <= now() then 'expired'
      else 'pending'
    end as effective_status
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  where o.is_demo = false   -- DEMO EXCLUSION
)
select
  count(*) filter (where effective_status = 'pending')  as pending,
  count(*) filter (where effective_status = 'accepted') as accepted,
  count(*) filter (where effective_status = 'revoked')  as revoked,
  count(*) filter (where effective_status = 'expired')  as expired,
  case
    when count(*) filter (where effective_status in ('accepted', 'revoked', 'expired')) > 0
      then round(
        count(*) filter (where effective_status = 'accepted')::numeric
        / count(*) filter (where effective_status in ('accepted', 'revoked', 'expired')),
        4
      )
    else 0
  end as acceptance_rate
from eff;

comment on view public.operator_invite_funnel is
  'Cross-tenant invitation funnel (effective status counts + acceptance rate over resolved invites), demo excluded. Service-role only; bypasses RLS by design.';

revoke all on public.operator_invite_funnel from anon, authenticated;
grant select on public.operator_invite_funnel to service_role;


-- operator_connector_adoption — how many real customers have at least one
-- ACTIVE connection, against the total real-customer count. Always one row.
create or replace view public.operator_connector_adoption as
with totals as (
  select count(*) as total_orgs
  from public.organizations
  where is_demo = false
),
connected as (
  select count(distinct c.organization_id) as orgs_connected
  from public.connections c
  join public.organizations o on o.id = c.organization_id
  where o.is_demo = false and c.status = 'active'
)
select
  t.total_orgs,
  c.orgs_connected,
  case
    when t.total_orgs > 0
      then round(c.orgs_connected::numeric / t.total_orgs, 4)
    else 0
  end as adoption_rate
from totals t, connected c;

comment on view public.operator_connector_adoption is
  'Cross-tenant connector adoption (real customers with >=1 active connection vs. total), demo excluded. Service-role only; bypasses RLS by design.';

revoke all on public.operator_connector_adoption from anon, authenticated;
grant select on public.operator_connector_adoption to service_role;


-- operator_demo_conversion — the DEMO funnel: demo links consumed vs. minted.
-- INTENTIONALLY demo-focused: it reads demo_invitations directly and does NOT
-- apply the is_demo exclusion (every row is a demo token by nature; excluding
-- demo would zero it out). This is the one analytics view that measures demo
-- activity on purpose. Always one row.
create or replace view public.operator_demo_conversion as
select
  count(*)                                          as minted,
  count(*) filter (where status = 'consumed')       as consumed,
  case
    when count(*) > 0
      then round(count(*) filter (where status = 'consumed')::numeric / count(*), 4)
    else 0
  end                                               as conversion_rate
from public.demo_invitations;

comment on view public.operator_demo_conversion is
  'The demo-link conversion funnel (consumed vs. minted). INTENTIONALLY demo-focused — does NOT apply the is_demo exclusion the other views use, since it measures the demo funnel itself. Service-role only.';

revoke all on public.operator_demo_conversion from anon, authenticated;
grant select on public.operator_demo_conversion to service_role;


-- Tell PostgREST to pick up the new views immediately.
notify pgrst, 'reload schema';


-- ============================================================================
-- Done.
-- ============================================================================
-- Verification (run in the SQL Editor after applying):
--
--   -- 1. All six views exist:
--   select table_name from information_schema.views
--   where table_schema = 'public'
--     and table_name in (
--       'operator_cost_daily','operator_cost_by_org','operator_cost_summary',
--       'operator_invite_funnel','operator_connector_adoption','operator_demo_conversion')
--   order by table_name;   -- expect all six
--
--   -- 2. Each is LOCKED (repeat per view): anon/authenticated denied, service_role allowed.
--   select
--     has_table_privilege('anon',          'public.operator_cost_by_org', 'SELECT') as anon_can_read,
--     has_table_privilege('authenticated', 'public.operator_cost_by_org', 'SELECT') as auth_can_read,
--     has_table_privilege('service_role',  'public.operator_cost_by_org', 'SELECT') as service_can_read;
--   -- expect: false, false, true
--
--   -- 3. security_invoker is OFF (owner-rights) on all six:
--   select c.relname, c.reloptions
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relname in (
--     'operator_cost_daily','operator_cost_by_org','operator_cost_summary',
--     'operator_invite_funnel','operator_connector_adoption','operator_demo_conversion');
--   -- expect: reloptions NULL on all six
--
--   -- 4. Real-customer views exclude demo; demo-conversion is demo-focused:
--   select * from public.operator_cost_by_org;          -- real orgs only; Demo Org ABSENT
--   select * from public.operator_cost_summary;         -- one row (today / week / projected monthly)
--   select day, cost_micro_usd from public.operator_cost_daily;   -- 30 gap-filled rows
--   select * from public.operator_invite_funnel;        -- one row of counts + acceptance_rate
--   select * from public.operator_connector_adoption;   -- one row; total_orgs excludes Demo Org
--   select * from public.operator_demo_conversion;      -- one row; minted>0 if any demo links exist
--                                                       --   (NOT zeroed by the demo exclusion)
-- ============================================================================
--
-- Rollback (if ever needed):
--   drop view if exists public.operator_demo_conversion;
--   drop view if exists public.operator_connector_adoption;
--   drop view if exists public.operator_invite_funnel;
--   drop view if exists public.operator_cost_summary;
--   drop view if exists public.operator_cost_by_org;
--   drop view if exists public.operator_cost_daily;
-- ============================================================================
