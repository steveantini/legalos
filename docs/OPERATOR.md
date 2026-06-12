# Operator runbook (internal)

The platform-owner's index (Documentation arc Step 1, D-158). This material
is deliberately NOT on the public documentation site: it covers cross-tenant
operations, content curation, and machinery that only legalOS-the-vendor
touches. The public docs (`/documentation`) cover users and org
administrators; this file covers everything above that tier, mostly by
pointing at the internal docs that already hold the detail.

## The platform tier

- **What it is:** a cross-tenant `platform_owner` grant (a separate axis from
  org roles; migration 0058, D-110), gating `/workspace/platform`. An org
  super_admin does NOT get access.
- **Surfaces:** the platform landing, Content library, Connectors, and
  Analytics — all under `/workspace/platform`, navigation driven by
  `lib/platform/nav.ts`.

## Content library operations (Claude for Legal)

- **Refresh from source:** the platform Content page's one-button refresh
  (D-112/D-113): fetches the public C4L repo, imports new agents into their
  mapped departments, never overwrites or resurrects, reports drift and the
  upstream commit it read. Placement mapping lives in
  `lib/content/vendor-registry.ts` (the hard ceiling), including the recorded
  `upstreamCommit` (D-150 housekeeping).
- **Connector drift:** the same refresh diffs the upstream `.mcp.json`
  connector configs against the shipped catalog and reports added, removed,
  or changed connectors, endpoint changes prominently (D-151). Never
  auto-applied: acting on drift is a reviewed code change.
- **Org-level governance** (which orgs show which libraries) is the
  super-admin Content section in Policy & access (D-114), not a platform
  action.

## Connector catalog curation

- **The catalog is code:** `lib/connections/providers/c4l-connector-catalog.ts`
  feeding the trusted registry (`mcp-registry.ts`, the D-089 hard ceiling).
  Adding/changing a connector is a reviewed commit, never a runtime action.
- **Status discipline (D-150):** `available` = pre-vetted, not live-verified;
  `verified` = connect + tool discovery + a real agent read proven live.
  Flipping a status is a one-line catalog change after the live test.
  CourtListener's operator verification steps are in `docs/ROADMAP.md`
  (the D-150 entry).
- **Capability flags:** `canEnumerate` records which connectors can back
  Knowledge collections (D-152).

## Cross-tenant analytics

- The platform Analytics page (D-140/D-141): service-role-locked SQL views
  (migrations 0067/0068), read only inside platform-owner-gated server
  components. Adding a metric = a view + a registry line + a tile
  (`lib/platform/metrics/registry.ts`).

## Demo machinery

- Shared, seeded, RLS-isolated Demo Org (D-132/D-133):
  `npm run mint-demo-token` mints single-use access links;
  `npm run reset-demo-org` soft-resets (or `--hard` reseeds) behind layered
  guards. Spec: `docs/DEMO_ACCESS_SCOPING.md`.

## Standing operational practices

- **Migrations:** applied by hand in the Supabase SQL Editor; the repo is
  deliberately unlinked; never `supabase db push`. Migrations are idempotent
  (tables → helpers → policies; the 0070 lesson).
- **Deploys:** push-to-main auto-deploys via GitHub→Vercel; verify the SHA is
  READY on the canonical domain after pushing.
- **Setup and env:** `SETUP.md` and `.env.example`. The MCP agent-tools flag
  (`MCP_AGENT_TOOLS_ENABLED`) and the Google MCP OAuth client env pair are
  the notable operational toggles.
- **The deeper records:** `CLAUDE.md` (conventions and rules),
  `DECISION_LOG.md` (every decision, D-000+), `docs/ROADMAP.md` (the live
  truth of what's next, including per-arc operator steps),
  `docs/SECURITY_ARCHITECTURE.md` (the trust narrative),
  `docs/FEATURES_CLAIMS.md` (the tour claims map, D-157),
  `docs/CHATBOT_HANDOFF.md` (session bootstrap).
