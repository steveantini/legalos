# Legal Department AI Launchpad Template: Project Outline

This is the living roadmap and architecture document for `legal-department-launchpad-template`. It complements `CLAUDE.md` (conventions) and `DECISION_LOG.md` (why the architecture is what it is).

---

## Vision

An AI-native, welcoming, high-adoption web app that serves as the single entry point for all AI agents and tools used by an in-house legal department. Starts with one corporate legal department (single-tenant) but is designed to become a multi-tenant SaaS if that path is chosen later.

The app supports two types of agents:
- **External agents:** Cards that link out to Gemini Gems, watsonX Orchestrate, custom-built widgets, or any other URL.
- **Native agents:** In-app chat experiences powered by the Anthropic API today, with a model abstraction layer added in Phase 6 to support OpenAI, Google, and other providers.

---

## Architecture Overview

### High-level data flow

```
                    ┌───────────────────────────┐
                    │  Browser (Next.js client)  │
                    │  - Launchpad UI            │
                    │  - Chat UI                 │
                    │  - Admin dashboard         │
                    └──────────────┬─────────────┘
                                   │
                      HTTPS / Auth cookies
                                   │
                    ┌──────────────▼─────────────┐
                    │  Vercel (Next.js server)   │
                    │  - Route handlers          │
                    │  - Server actions          │
                    │  - Middleware (auth)       │
                    └──┬───────────────────────┬─┘
                       │                       │
        Supabase JS    │                       │   Anthropic SDK
        (with user JWT)│                       │   (server-side)
                       │                       │
         ┌─────────────▼──────┐     ┌──────────▼──────────┐
         │  Supabase          │     │  Anthropic API      │
         │  - Postgres + RLS  │     │  - Messages API     │
         │  - Auth            │     │  - Streaming        │
         │  - Storage (later) │     └─────────────────────┘
         └────────────────────┘
```

### Critical architectural rules

1. **The Anthropic API key never leaves the server.** All LLM calls go through Next.js route handlers or server actions on Vercel.
2. **Row-Level Security is the last line of defense.** Even if the frontend is compromised, the database enforces access control.
3. **Agents and departments are data, not code.** Adding a new agent or department is a database insert, not a deploy.
4. **One codebase, multi-tenant-ready.** Every relevant table carries `organization_id` from day one, even though we serve one organization for now.

---

## Role-Based Access Model

### Roles

| Role | Description | Created How |
|---|---|---|
| `super_admin` | Can manage all organizations. Reserved for platform owner. | Seed only |
| `org_admin` | Can manage users, roles, and agents within their organization. | Assigned by super_admin |
| `dept_admin` | Can manage agents within their department. View department analytics. | Assigned by org_admin |
| `user` | Can access departments they have been granted access to. | Assigned by org_admin or dept_admin |

### Department access

Department access is independent of role. A user has zero or more rows in the `user_department_roles` table, each granting access to one department with a specific role scoped to that department.

**Example:** A user may be a `dept_admin` for Commercial and a `user` for M&A, and have no access to Privacy.

### How access is enforced

- **UI layer (UX only):** Navigation and cards are filtered to departments the user has access to. This is cosmetic — it's meant to reduce confusion, not to enforce security.
- **Middleware layer:** Auth middleware validates the Supabase session on every request to authenticated routes.
- **Server action layer:** Every server action re-reads the user's department permissions from the DB. Never trust a department ID from the client without re-validation.
- **Database layer (last line):** RLS policies on `agents`, `conversations`, `messages`, and `usage_events` reference `user_department_roles` to determine what the user can see. If the other three layers fail, the DB still refuses.

---

## Data Model (Phase 1 seed)

These tables are created in Phase 1. Phase 2 adds `conversations`, `messages`, and `usage_events`. Later phases may add more.

| Table | Purpose | Notes |
|---|---|---|
| `organizations` | The tenant. One row for a single-customer deployment. | Multi-tenant ready. |
| `users` | User profile, joined to Supabase `auth.users`. | One row per auth user. |
| `departments` | Commercial, M&A, Public Sector, GR&RA, Privacy, etc. | Seed with the initial five. |
| `user_department_roles` | Join table: which user has which role in which department. | Enforces access control. |
| `agents` | All agents (external + native). | `type` column: `external` or `native`. |
| `analytics_events` | Clicks, chat starts, etc. | Phase 1 starts in localStorage; real table is wired in Phase 2. |

Phase 2 additions:

| Table | Purpose |
|---|---|
| `conversations` | A chat thread between a user and a native agent. |
| `messages` | Individual messages in a conversation. |
| `usage_events` | Per-call token usage and cost tracking. |

---

## Phased Roadmap

### Phase 0 — Foundation (2–3 days)

**Goal:** A deployable-but-empty app with the scaffolding in place.

- Create repo `legal-department-launchpad-template`.
- Fill in `CLAUDE.md`, `PROJECT_OUTLINE.md`, `DECISION_LOG.md`, `SETUP.md`, `README.md`, `CHANGELOG.md`.
- Scaffold Next.js 15 + TypeScript + Tailwind + shadcn/ui.
- Create Supabase project (dev). Enable auth. No tables yet.
- Deploy to Vercel. Verify preview + prod pipelines.
- Port theme presets (Carbon, Modern, Minimal) from the prior `agent-launchpad-template` as Tailwind config + CSS variables.
- Copy Phase 0 skills into `.claude/skills/` (see `skills-checklist.md`).
- Seed `config/site.ts` with placeholder branding.

**Definition of done:** Push to `main`; site loads on Vercel; a health-check route returns 200; `CLAUDE.md` renders correctly on GitHub.

---

### Phase 1 — Commercial Launchpad + Auth (~1 week)

**Goal:** A working single-department launchpad with auth and role-based access, matching the UX of the previous `agent-launchpad-template` but in Next.js.

- Supabase Auth: email/password + magic link.
- Schema + migrations: `organizations`, `users`, `departments`, `user_department_roles`, `agents`.
- RLS policies on all of the above.
- Seed data: one organization, five departments, a set of Commercial external agent cards (Gemini Gems, watsonX, generic links).
- Auth middleware; login, logout, magic-link flows.
- Commercial department page: card grid, category sections, support button, welcome modal, tips section.
- Admin dashboard (role-gated): productivity gains calculator (ported from prior template), adoption metrics scaffold.
- Analytics: localStorage in Phase 1 — we'll promote to Supabase in Phase 2 when usage volume justifies the table design.

**Definition of done:** A test user can log in, land on the Commercial department, click an external agent card, and see the click recorded in localStorage. An admin user can see the admin dashboard and use the calculator.

---

### Phase 2 — Native Agent Runtime (1–2 weeks)

**Goal:** First in-app AI chat experience, with real analytics in Supabase.

- Schema: `conversations`, `messages`, `usage_events`.
- RLS policies: users can only see their own conversations and messages.
- Chat UI: streaming responses, markdown rendering (sanitized), code block display, conversation history, new-conversation button.
- Server-side chat route handler: receives user message, validates, loads system prompt from `agents` table, calls Anthropic API, streams response, persists messages, logs usage.
- First native agent: a Commercial contract-review assistant. System prompt stored in DB, not code.
- Promote analytics from localStorage to Supabase `analytics_events` table.
- Cost and token usage dashboard scaffold (admin only).

**Definition of done:** A user can open a native Commercial agent, have a multi-turn streaming conversation, see their message history persist across sessions, and the admin can see token usage logged.

---

### Phase 3 — M&A Department (3–5 days)

**Goal:** Prove that adding a department is a scoped, repeatable task.

- Seed M&A department row.
- One or two M&A-specific native agents.
- Validate cross-department access: a user with access to both Commercial and M&A can switch between them; a user with access to only Commercial cannot see M&A content anywhere.
- First test of the RLS policies against a real multi-department user set.

**Definition of done:** A user with Commercial + M&A access sees both departments. A user with only Commercial access gets a clean "not found" or redirect if they try to force-navigate to M&A. RLS stops them at the DB even if middleware misses.

---

### Phase 4 — Public Sector, GR&RA, Privacy (~2 weeks)

**Goal:** All five target departments live.

- Public Sector department page + agents.
- GR&RA department page + agents.
- Privacy department page + agents.
- Cross-department shared agents where relevant (e.g., a privacy-review assistant any department can invoke).
- Per-department admin views (scoped to `dept_admin` role).

**Definition of done:** All five departments are functional end-to-end. A demo walk-through covers at least one external agent and one native agent per department.

---

### Phase 5 — Agent Admin UI (~1 week)

**Goal:** Let legal ops staff create and edit agents in-app, without a PR or deploy.

- Agent create / edit form (org_admin and dept_admin roles only).
- System prompt editor with version history.
- Model picker (Anthropic-only for now; abstraction comes in Phase 6).
- Department assignment.
- Enable/disable toggle.
- Audit trail: who changed what, when.

**Definition of done:** An org_admin can create a new native agent entirely through the UI, and it appears on the correct department launchpad without a deploy.

---

### Phase 6 — Model Abstraction (~1 week)

**Goal:** Agents can run on any supported model provider.

- Provider abstraction layer (per `model-abstraction.md` skill).
- OpenAI adapter.
- Google (Gemini) adapter.
- Per-agent model selection in the agent admin UI.
- Fallback chain: if provider A fails, try provider B.
- Normalized cost tracking across providers.

**Definition of done:** An agent can be flipped from Claude to GPT to Gemini via the admin UI, conversations continue to work, and cost tracking correctly attributes spend by provider.

---

### Phase 7 — Evals, Observability, Cost Dashboard (1–2 weeks)

**Goal:** Production-quality guardrails for a growing agent catalog.

- Eval framework: per-agent test suite with expected-output assertions.
- CI integration: PRs that change system prompts trigger eval runs; regressions block merge.
- OpenTelemetry traces on chat calls.
- Error tracking (Sentry or equivalent).
- Full cost dashboard: by organization, department, user, agent, model, time range.
- Budget alerts.

**Definition of done:** An admin can see a per-agent quality score, trace any slow or failed conversation, and get alerted when monthly spend crosses a threshold.

---

### Phase 8 — Extended Departments

**Goal:** Products, Compliance, Litigation, IP. Each department should now be ~80% configuration + agent definitions.

- Templated department onboarding: a playbook that takes ~1 day per department by this point.
- Extended agent library per department.

---

### Phase 9 (optional, future) — Multi-tenant SaaS

**Goal:** If the template is ever productized, this phase makes it a true SaaS.

- Organization signup flow.
- Stripe billing + plans.
- Per-org branding and theme.
- Tenant isolation testing (adversarial).
- Support ticketing.
- Status page.

The `organization_id` foundation from Phase 1 makes this a scoped project rather than a rewrite.

---

## Non-goals

To keep scope honest, the following are explicitly **not** part of this project unless/until a future decision changes it:

- Building a document management system.
- Building a matter management system.
- Replacing existing practice management tools (Clio, NetDocuments, iManage).
- E-billing integration.
- Client portals for outside counsel.

These are adjacent to the legal department's stack but out of scope for a launchpad.

---

## Current status

**Phase:** 0 — Foundation
**Next milestone:** First successful Vercel deploy with Next.js scaffolding and all six docs in place.
