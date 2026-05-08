# legalOS: Project Outline

This is the living roadmap and architecture document for legalOS — an operating system for legal departments. It complements `CLAUDE.md` (conventions) and `DECISION_LOG.md` (why the architecture is what it is).

---

## Vision

legalOS is the AI-native operating system that serves as the single entry point for every workflow, agent, and tool used by an in-house legal department. It starts with one corporate legal department (single-tenant) but is designed to become a multi-tenant SaaS if that path is chosen later.

The app supports two types of agents:
- **External agents:** Cards that link out to Gemini Gems, watsonX Orchestrate, custom-built widgets, or any other URL.
- **Native agents:** In-app chat experiences powered by the Anthropic API today, with attached references, prompt caching, web search, and Word-document export. A model abstraction layer added in Phase 6 supports OpenAI, Google, and other providers.

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
                    │  - Proxy (auth)            │
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
- **Proxy layer:** The Next.js proxy (`proxy.ts`) validates the Supabase session on every request to authenticated routes.
- **Server action layer:** Every server action re-reads the user's department permissions from the DB. Never trust a department ID from the client without re-validation.
- **Database layer (last line):** RLS policies on `agents`, `conversations`, `messages`, and `usage_events` reference `user_department_roles` to determine what the user can see. If the other three layers fail, the DB still refuses.

---

## Data Model

### Phase 1 — Shipped

| Table | Purpose | Notes |
|---|---|---|
| `organizations` | The tenant. One row for a single-customer deployment. | Multi-tenant ready. |
| `users` | User profile, joined to Supabase `auth.users`. | One row per auth user. |
| `departments` | Commercial, M&A, Public Sector, GR&RA, Privacy, etc. | Seeded with the five starter departments. |
| `user_department_roles` | Join table: which user has which role in which department. | Enforces access control. |
| `agents` | All agents (external + native). | `type` column: `external` or `native`. `category` column added in `0003`. |

### Phase 2 — Shipped (Sessions 8a / 8b runtime foundations)

| Table | Purpose |
|---|---|
| `conversations` | A chat thread between a user and a native agent. Snapshots `system_prompt` and `model` at creation per CLAUDE.md AI Integration Rules. |
| `messages` | Individual messages in a conversation. Immutable in practice. |
| `usage_events` | Per-call token usage and cost tracking. Append-only ledger. |

### Phase 2 — Remaining (per `docs/AGENT_ARCHITECTURE.md`)

| Table | Purpose |
|---|---|
| `agent_attachments` | Permanent per-agent attached references (PDF, DOCX, TXT, MD, XLSX). Includes cached `extracted_text`, `delivery_mode`, `source_type`. |
| `message_attachments` | Per-message file uploads (Section 5a — core chat capability). Turn-scoped, garbage-collected on a longer cadence. |
| `formatted_outputs` | Audit + dedup record for server-rendered exports (Word `.docx` in v1; XLSX / Google Workspace / PowerPoint deferred). |
| `analytics_events` | Promotion from localStorage to Supabase per D-010. Independent of agent runtime architecture; tracked as a Phase 2 work item but not part of the architecture doc's phasing list. |

`agents` also gains: `is_template`, `forked_from_agent_id`, `tools_enabled` (JSONB), `default_output_format`, `deleted_at` (soft delete with 30-day undo). `agents.created_by` already exists from `0001` and is reused. `usage_events` gains `cache_creation_tokens` and `cache_read_tokens` for prompt caching. Two Supabase Storage buckets land alongside: `agent-attachments` and `message-attachments`, both RLS-policied.

---

## Phased Roadmap

### Phase 0 — Foundation (2–3 days)

**Goal:** A deployable-but-empty app with the scaffolding in place.

- Create repo `legal-department-launchpad-template`.
- Fill in `CLAUDE.md`, `PROJECT_OUTLINE.md`, `DECISION_LOG.md`, `SETUP.md`, `README.md`, `CHANGELOG.md`.
- Scaffold Next.js 16 + TypeScript + Tailwind v4 + shadcn/ui.
- Create Supabase project (dev). Enable auth. No tables yet.
- Deploy to Vercel. Verify preview + prod pipelines.
- Port theme presets (Carbon, Modern, Minimal) from the prior `agent-launchpad-template` using Tailwind v4's `@theme` directive and CSS variables.
- Copy Phase 0 skills into `.claude/skills/` (see `skills-checklist.md`).
- Seed `config/site.ts` with placeholder branding.

**Definition of done:** Push to `main`; site loads on Vercel; a health-check route returns 200; `CLAUDE.md` renders correctly on GitHub.

---

### Phase 1 — Commercial Launchpad + Auth (~1 week)

**Goal:** A working single-department launchpad with auth and role-based access, matching the UX of the previous `agent-launchpad-template` but in Next.js.

- Supabase Auth: magic link only (per D-018, amends D-006).
- Schema + migrations: `organizations`, `users`, `departments`, `user_department_roles`, `agents`.
- RLS policies on all of the above.
- Seed data: one organization, five departments, a set of Commercial external agent cards (Gemini Gems, watsonX, generic links).
- Auth proxy (`proxy.ts`); login, logout, magic-link flows.
- Commercial department page: card grid, category sections, support button, welcome modal, tips section.
- Admin dashboard (role-gated): productivity gains calculator (ported from prior template), adoption metrics scaffold.
- Analytics: localStorage in Phase 1 — we'll promote to Supabase in Phase 2 when usage volume justifies the table design.

**Definition of done:** A test user can log in, land on the Commercial department, click an external agent card, and see the click recorded in localStorage. An admin user can see the admin dashboard and use the calculator.

---

### Phase 2 — Native Agent Runtime + User-Owned Agents (multi-session arc)

**Goal:** Native agents become user-owned, user-configurable workspaces — with attached references, configurable tools, multi-format output, prompt caching, and a multi-vendor-ready directory structure. Phase 2 is a multi-session arc, not a single-week sprint, originally scoped narrower (D-023) and expanded mid-phase (D-025) to match the product vision captured in `docs/AGENT_ARCHITECTURE.md`.

**Already shipped in Phase 2:**

- **Session 8a — Runtime foundations.** Schema `0004_native_agents.sql` (`conversations`, `messages`, `usage_events`, `message_role` enum, full RLS in the user-owns + admin-read idiom). `lib/anthropic/` runtime helpers (`client.ts`, `pricing.ts`, `prompt-defense.ts`, `rate-limit.ts`, `stream.ts`, `types.ts`). `app/api/chat/route.ts` SSE streaming endpoint. Test Smoke Agent seed at `0003_test_native_agent.sql`. See D-023 for the bundled architectural commitments.
- **Session 8b — Chat UI.** `/agents/[id]` route, `components/chat/` (interface, message list, bubbles, input, SSE parser, sanitized markdown renderer). `components/launchpad/agent-card.tsx` branches native vs external. End-to-end smoke test passed against the live runtime.

**Remaining work (mirrors `docs/AGENT_ARCHITECTURE.md` § implementation phasing — sequenced when picked up, not pre-numbered):**

1. `lib/anthropic/` → `lib/llm/anthropic/` move + vendor-prefixed model ids + single-case dispatcher. Pure structural; lays the groundwork for multi-vendor without shipping a second adapter.
2. Schema migration: agents extensions (`is_template`, `forked_from_agent_id`, `tools_enabled`, `default_output_format`, `deleted_at`), `agent_attachments`, `message_attachments`, `formatted_outputs`, `usage_events` cache columns. RLS on every new table; Storage buckets and policies.
3. Agent CRUD UI — create / edit form, fork-from-template, soft-delete with 30-day undo, My Agents section per department, Templates section (six Commercial templates + Blank Agent). Single form with progressive disclosure; the biggest user-visible session in Phase 2.
4. Test Smoke Agent retirement — once a real user-created native agent works end-to-end, the seed is removed (or replaced with a no-op preserving documentation comments). Closes the deferred 8a → 8c retirement note.
5. Permanent attachments — upload, server-side text extraction, `extracted_text` cache, attachments enter the cached prompt portion of every Anthropic request.
6. Prompt caching wiring — `cache_control: { type: "ephemeral" }` markers on the cacheable portion; `cache_creation_tokens` / `cache_read_tokens` populated in `usage_events`; updated cost math. Required architecture per `docs/AGENT_ARCHITECTURE.md` §1, not optimization.
7. Per-message file upload — paperclip in chat input, `message-attachments` bucket and table, extraction reused from (5). The "here's the NDA the other side sent us" workflow.
8. Web search tool — Anthropic's built-in web search, `tools_enabled` validation against the catalog, sources rendered inline in chat for provenance, search cost into `usage_events`.
9. Word `.docx` export — server-side renderer, "Download as Word" button bound to `default_output_format = docx`, `formatted_outputs` audit row.
10. Six Commercial templates conversion + Blank Agent template — the moment Phase 2 has a real catalog instead of a Test Smoke Agent.

**Tracked as a Phase 2 commitment but independent of the architecture doc:**

- **Promote analytics from localStorage to Supabase** (per D-010). Phase 1 deferred this to Phase 2; the agent architecture doc deliberately excludes it because it is independent of agent runtime architecture. Lands as part of Phase 2 close-out: `analytics_events` table, write path from existing `lib/analytics/events.ts` call sites, admin metrics page reads from Supabase instead of localStorage.

**Definition of done:** Users can create native agents from templates or from blank, attach references, enable web search, choose Word output, and have full chat conversations with streaming, prompt caching, and cost tracking. Six Commercial templates ship as the baseline catalog. Analytics events live in Supabase with admin metrics reading from the table.

---

### Phase 3 — M&A Department (3–5 days)

**Goal:** Prove that adding a department is a scoped, repeatable task.

- Seed M&A department row.
- One or two M&A-specific native agents.
- Validate cross-department access: a user with access to both Commercial and M&A can switch between them; a user with access to only Commercial cannot see M&A content anywhere.
- First test of the RLS policies against a real multi-department user set.

**Definition of done:** A user with Commercial + M&A access sees both departments. A user with only Commercial access gets a clean "not found" or redirect if they try to force-navigate to M&A. RLS stops them at the DB even if the proxy misses.

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

**Goal:** Admin-level oversight surface over the user-owned agent estate.

User-level agent create / edit ships in Phase 2 (per `docs/AGENT_ARCHITECTURE.md` and D-025 — every user creates and owns their own agents from templates or blank). Phase 5's scope is the residual admin work that does not belong in the per-user surface:

- Cross-user view of every agent in the organization (org_admin) and in a department (dept_admin).
- Force-disable / re-enable on any user-owned agent.
- Ownership transfer when a user leaves the organization.
- Audit trail: who created / edited / deleted / forked which agent, when. Reads from the existing soft-delete and (deferred) versioning data; if agent versioning lands per the deferred items list in the architecture doc, the audit view consumes it.
- Template management — adding / editing / retiring templates beyond the six Commercial + Blank Agent set that ships in Phase 2 (item 10 of Phase 2's remaining work).

**Definition of done:** An org_admin can see every agent in the organization, force-disable one if needed, transfer ownership, and view an audit trail of changes.

---

### Phase 6 — Multi-Vendor Model Adapters (~1 week)

**Goal:** Agents can run on OpenAI and Google models, not just Anthropic.

The directory structure (`lib/llm/<vendor>/`), the vendor-prefixed model id format (`anthropic/claude-sonnet-4-6`), the single-case dispatcher, the bounded model picker, and the multi-vendor pricing table all ship in Phase 2 (per `docs/AGENT_ARCHITECTURE.md` § 6 and Phase 2 work item 1). Phase 6's scope is the actual multi-vendor implementation against that structure:

- OpenAI adapter under `lib/llm/openai/`. Adds a case to the dispatcher; populates pricing table rows for the supported models.
- Google (Gemini) adapter under `lib/llm/google/`. Same pattern.
- Per-vendor caching strategy — Anthropic uses `cache_control` markers (already wired in Phase 2 per item 6); OpenAI caches automatically with no markers; Gemini sets cache headers per Google's API. Each adapter owns its caching strategy; the `usage_events` cache columns are vendor-neutral and each adapter populates them from its own SDK's response shape.
- Surface the new vendor models in the bounded model picker (Section 2 of the architecture doc), so users can pick `openai/gpt-5.1` or `google/gemini-...` from the same dropdown that already offers Claude models.
- Fallback chain (optional): if vendor A's adapter fails mid-stream, try vendor B with the same prompt and conversation snapshot. Worth shipping if real outages surface; worth deferring if not.
- Normalized cost tracking is mostly already there — the pricing table is keyed on vendor-prefixed model ids from Phase 2 — so this phase is mostly about adding vendor rows to the same table.

**Definition of done:** A user can select an OpenAI or Google model in the agent edit form, conversations stream through the appropriate adapter, cost tracking attributes spend correctly by vendor, and prompt caching works per each vendor's semantics.

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

**Phase:** 2 — Native Agent Runtime + User-Owned Agents (mid-phase).
**Shipped:** Sessions 8a–22. Recent work: routing migration to `/workspace` prefix (D-036), `unpdf` swap for serverless-safe PDF extraction, marketing landing at `/` with two-phase glyph choreography, palette retune proportional to sRGB headroom (D-037), Vercel Analytics + Speed Insights wired.
**Next milestone:** Login / auth UX polish (Session 23). Subsequent: invitation gate (sunsets D-035), custom SMTP via Resend (production-prerequisite for wider URL sharing).
