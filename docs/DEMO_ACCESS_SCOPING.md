# Demo access — scoping doc

> **SUPERSEDED NOTE (2026-06-08): this is NOT the design that shipped.** Demo
> access shipped as a SHARED, seeded, RLS-isolated Demo Org, not the per-session
> isolated model described below. What exists today (D-132 and D-133): one Demo
> Org seeded by `supabase/seed/demo-org.sql` and flagged `organizations.is_demo`
> (migration 0064); a `/demo/<token>` route (`app/demo/[token]/route.ts`) that
> signs a prospect in as super_admin of that shared org with a single-use,
> SHA-256-hashed token (migration 0065, `demo_invitations`) and no email; minting
> via `npm run mint-demo-token` and resetting via `npm run reset-demo-org`. There
> is NO per-session org-per-user, NO `/demo/invite/[token]`, NO `lib/demo/seed.ts`,
> and NO TTL cleanup cron. The per-session design preserved below is a legitimate
> ADDITIVE-FUTURE option (richer isolation if shared-org noise ever warrants it),
> kept here as the spec for THAT future work only. Do not build from the text
> below as if it were the current design. See ROADMAP item 21 and D-132/D-133 for
> what is live.

Internal scoping for the per-session-isolated demo access feature. Status: ready to implement; deferred until prioritized. When this session is queued, this doc is the build spec — implementation should follow without re-litigating decisions.

See D-049 in `DECISION_LOG.md` for the architectural decision and rejected alternatives.

## Goal

Let the operator distribute a `/demo` URL via trusted channels (Signal, text, in-person) that signs the recipient into a fully-isolated, time-bounded demo workspace with realistic seed data. No real email collected from the demo user. Each demo user sees their own private copy of the seed; their actions don’t affect other demo users or the operator’s real data.

## Architecture

### Auth flow

1. Operator generates a single-use invitation token via an admin UI (Phase 3 below). Token has a TTL (suggested 24 hours from generation), is stored in a new `demo_invitations` table, and is delivered to the demo user via a URL: `legalos.com/demo/invite/<token>`.

2. Demo user clicks the URL. The `/demo/invite/[token]` route:
   - Validates the token (exists, not yet used, not expired)
   - Marks the token as consumed
   - Calls `supabase.auth.admin.createUser({ email: "demo-<uuid>@legalos-internal.invalid", email_confirm: true })` using the service-role key. The `.invalid` TLD is reserved by RFC 2606 and unroutable, ensuring no accidental real-email collision.
   - Calls `supabase.auth.admin.generateLink({ type: "magiclink", email: theSyntheticEmail })` and consumes the link server-side to issue the session cookie
   - Provisions a fresh per-user demo workspace (see “Per-session data” below)
   - Redirects to `/workspace`

3. Demo user lands on `/workspace` with a real Supabase session. All existing RLS, role assignments, and access control work unchanged — they’re a real Supabase user with synthetic email and their own scoped data.

### Per-session data

Demo users get their own isolated copy of the seed data, not a shared org. Two implementation options for “their own copy”:

- **Option 1 (simpler): Full data duplication on provisioning.** Each new demo user gets their own new `organization` row with a `is_demo: true` flag, and the seed data (departments, agents, conversations) is fully copied into that org via a `seedDemoOrg(orgId)` function. Each demo user has independent rows for everything. Storage cost: ~1MB per demo user × N concurrent demos.

- **Option 2 (more efficient): Copy-on-write with a shared seed.** A single “Demo Seed Org” holds the canonical seed data. Demo users get a thin org pointer with overlay tables; reads union the seed + their overlay; writes go to the overlay. Lower storage but significantly more complex query layer.

**Default: Option 1.** Storage cost is negligible at the scale of “small select few people”; the simplicity wins.

### Seed data (realistic fidelity)

The Demo Org seed includes:

- **4-5 departments** matching a realistic in-house legal team: Commercial, Privacy, Mergers & Acquisitions, Public Sector, Operations. Each with a real-sounding description matching the operator’s normal demo pitch.
- **8-10 agents** spread across departments, covering the range of agent types currently in the product:
  - Commercial: Contract review agent, NDA reviewer, vendor MSA reviewer
  - Privacy: DPA reviewer, GDPR compliance assistant
  - M&A: Due diligence assistant
  - Public Sector: RFP reviewer
  - Operations: Vendor onboarding agent
  - General Tools: Legal research assistant, document drafter

  Each agent gets a realistic system prompt (drawn from the operator’s existing agent library at seed creation time) and a description.
- **3-5 conversations per agent** with realistic legal questions and AI-generated responses. Conversations show off the product’s chat experience, citation handling, and tool-call patterns. Conversations should look like real lawyer queries: “Review this MSA and flag any unusual indemnification language,” “What are the GDPR implications of transferring data to a US processor,” etc.

The seed lives in `lib/demo/seed.ts` as exported data structures. The `seedDemoOrg(orgId)` function reads from this and writes to the database. When the operator ships new agent types or features, the seed data is updated manually — this is the maintenance cost of the realistic-fidelity choice (see D-049’s Consequences section).

### TTL and cleanup

- Demo users + their data auto-cleaned **7 days** after creation.
- Implementation: a Vercel cron job (or Supabase scheduled function) runs daily, calling `supabase.auth.admin.deleteUser(uuid)` for every demo user where `created_at < NOW() - INTERVAL '7 days'`. Cascade delete removes the demo org and all owned rows.
- Demo invitation tokens also auto-expire 24 hours after generation (per the invitation TTL); separate cleanup pass removes consumed and expired tokens.

### UI affordance — optional cosmetic layer

Optional Phase 6: layer a “demo mode” cosmetic indicator over the workspace UI when the user is a demo user. Approaches:

- Small banner at the top: “Demo mode — your data resets on <date>”
- `?demo=true` URL query that conditionally hides destructive actions in the UI (Delete buttons, etc.) — cosmetic only, not security; backend allows the action, the button just isn’t rendered
- An avatar-menu indicator showing demo status + days remaining

Decide at implementation time. Not load-bearing.

## Implementation phases

### Phase 1 — Database schema

New tables in a Supabase migration:

```sql
-- Invitation tokens
CREATE TABLE demo_invitations (
  token TEXT PRIMARY KEY,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  consumed_at TIMESTAMPTZ,
  consumed_by_user UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ NOT NULL  -- 24h from creation
);

-- Add is_demo column to organizations
ALTER TABLE organizations ADD COLUMN is_demo BOOLEAN DEFAULT FALSE NOT NULL;
```

RLS: `demo_invitations` accessible only via service-role (no client-side reads); `is_demo` orgs accessible via the standard org-membership RLS but additionally tracked for cleanup.

### Phase 2 — Seed data module

`lib/demo/seed.ts` exports:

```ts
export const DEMO_DEPARTMENTS: DepartmentSeed[] = [ ... ];
export const DEMO_AGENTS: AgentSeed[] = [ ... ];
export const DEMO_CONVERSATIONS: ConversationSeed[] = [ ... ];

export async function seedDemoOrg(orgId: string): Promise<void> { ... }
```

The seed data should be authored once and lightly maintained as the product evolves. When a new agent type ships, add a representative agent to `DEMO_AGENTS`.

### Phase 3 — Invitation generation

Admin route at `/workspace/admin/demo-invitations` (gated by `requireAdminUser`) lets the operator:

- Generate a new invitation token (POST creates a row in `demo_invitations`, returns the full URL to share)
- View pending/consumed/expired tokens
- Revoke a pending token

The token is a high-entropy random string (32+ bytes base64url, suggested `crypto.randomBytes(32).toString('base64url')`).

### Phase 4 — Demo invitation route

`app/demo/invite/[token]/page.tsx` (or `route.ts` if no UI needed):

1. Look up token in `demo_invitations`
2. If invalid/consumed/expired, render an error page with a “Request access” mailto
3. If valid: server action creates the demo user via `supabase.auth.admin.createUser` with synthetic email + email_confirm
4. Create a new org with `is_demo: true`, link user to org via `org_users` row
5. Call `seedDemoOrg(newOrgId)` to populate the new org with seed data
6. Mark token as consumed
7. Generate magic link via `admin.generateLink`, consume server-side to set session cookie
8. Redirect to `/workspace`

### Phase 5 — Cleanup job

Vercel cron at `/api/cron/cleanup-demo` (or a Supabase Edge Function) runs daily at 03:00 UTC:

```ts
// Delete demo users older than 7 days
const expiredUsers = await supabase
  .from('auth.users')
  .select('id')
  .lt('created_at', sevenDaysAgo)
  .like('email', '%@legalos-internal.invalid');

for (const user of expiredUsers) {
  await supabase.auth.admin.deleteUser(user.id);
  // Cascade delete via foreign keys removes the org and all owned rows
}

// Delete expired invitation tokens
await supabase
  .from('demo_invitations')
  .delete()
  .or(`expires_at.lt.${now},consumed_at.not.is.null`);
```

Add the cron to `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/cleanup-demo", "schedule": "0 3 * * *" }
  ]
}
```

### Phase 6 — UI affordance (optional)

If implemented: an `is_demo` flag in the session context, exposed via `getCurrentUserProfile()`, used to render a top-of-workspace banner showing demo status + days remaining. Optionally: a `?demo=true` URL param that hides Delete buttons across the workspace UI.

Implementation decision deferred to the build session.

## Security guardrails

1. **Service-role key isolation.** The service-role key (used for `auth.admin.*` calls) lives in `SUPABASE_SERVICE_ROLE_KEY` env var. Never exposed to the browser. Only `/demo/invite/[token]` and `/api/cron/cleanup-demo` use it.

2. **Token entropy.** Invitation tokens are 32+ bytes from `crypto.randomBytes`. Sufficiently unguessable that brute-force attempts are infeasible.

3. **Token single-use.** Tokens marked consumed atomically with user creation; double-consume is rejected at the DB level via the `consumed_at IS NULL` check.

4. **Rate limiting.** Token consumption rate-limited (suggested: 10 attempts per IP per hour) to prevent enumeration. Implement via middleware or via Supabase RPC with rate-limit logic.

5. **Synthetic email domain locked.** Code path that creates demo users hard-codes the `@legalos-internal.invalid` domain. Demo accounts can never collide with real users because real users can never have `.invalid` emails (no MX delivery possible).

6. **Cleanup idempotency.** The cleanup job is safe to run multiple times — `auth.admin.deleteUser` is idempotent; expired token cleanup uses unconditional DELETE.

## Implementation estimate

One focused session for Phases 1–5 (the core feature). Phase 6 (UI affordance) adds maybe a half-session if implemented.

Total: ~1-1.5 sessions of focused work when prioritized.

## Open questions for build session

- Should the invitation admin UI live under `/workspace/admin/demo-invitations` or as a CLI command? (Default: admin UI; CLI is fine if quicker.)
- Should demo users see a small “Demo mode” indicator in the workspace? (Default: yes, simple top banner.)
- Should the seed data include sample tool calls / web search results to show off citation handling? (Default: yes, at least one agent’s conversation includes a tool-call example.)
- Should there be a hard cap on concurrent demo users? (Default: no cap; rate-limit via token generation instead.)
