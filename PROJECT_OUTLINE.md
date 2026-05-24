# legalOS: Project Outline

This is the living roadmap and architecture document for legalOS — an operating system for legal departments. It complements `CLAUDE.md` (conventions) and `DECISION_LOG.md` (why the architecture is what it is).

---

## Vision

legalOS is the AI-native operating system that serves as the single entry point for every workflow, agent, and tool used by an in-house legal department. It starts with one corporate legal department (single-tenant) but is designed to become a multi-tenant SaaS if that path is chosen later.

The app supports two types of agents:
- **External agents:** Cards that link out to Gemini Gems, watsonX Orchestrate, custom-built widgets, or any other URL.
- **Native agents:** In-app chat experiences powered by the Anthropic API today, with attached references, prompt caching, web search, and per-message markdown download (full Word `.docx` export deferred to the README backlog). A multi-vendor-ready model abstraction layer is in place (Phase 2, via vendor-prefixed model IDs, the `lib/llm/<vendor>/` directory structure, a single-case dispatcher, and a multi-vendor pricing table); the OpenAI, Google, and other adapter implementations land in Phase 6.

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
| `departments` | Commercial, Corporate, Regulatory, Public Sector, Compliance, Privacy, AI Governance, Product, Employment, IP, Litigation, Operations, General Tools. | Seeded with 13 departments organized into four product clusters (deal & transactional, regulatory & compliance, specialized practice, operational & utility). M&A renamed to Corporate in migration 0028; GR&RA merged into Public Sector + General Tools in migration 0013. |
| `user_department_roles` | Join table: which user has which role in which department. | Enforces access control. |
| `agents` | All agents. | `type` column (`'external'` \| `'native'`) retained from migration 0001 to preserve partner-integration headroom; migration 0016 converted all seeded agents to native, so all current rows are native. `category` column added in `0003`. |

### Phase 2 — Shipped (Sessions 8a / 8b runtime foundations)

| Table | Purpose |
|---|---|
| `conversations` | A chat thread between a user and a native agent. Snapshots `system_prompt` and `model` at creation per CLAUDE.md AI Integration Rules. |
| `messages` | Individual messages in a conversation. Immutable in practice. |
| `usage_events` | Per-call token usage and cost tracking. Append-only ledger. |

### Phase 2 — Shipped (post 8a/8b expansion)

| Table / artifact | Status | Migration |
|---|---|---|
| `agent_attachments` | shipped — permanent per-agent attached references with cached `extracted_text`, `delivery_mode`, `source_type` | 0007 |
| `message_attachments` | shipped — per-message file uploads, turn-scoped | 0007 |
| `formatted_outputs` | shipped — audit + dedup record for server-rendered exports | 0007 |
| Supabase Storage buckets (`agent-attachments`, `message-attachments`) | shipped — RLS-policied | 0008 |
| `usage_events` cache columns (`cache_creation_tokens`, `cache_read_tokens`) | shipped — populated by prompt caching wiring | 0007 / 0011 |
| `agents` extensions (`is_template`, `forked_from_agent_id`, `tools_enabled` JSONB, `default_output_format`, `deleted_at`) | shipped — soft delete with 30-day undo lives on `deleted_at`. `agents.created_by` already existed from 0001 and is reused. | 0006 |
| `analytics_events` | **deferred** — Phase 2 commitment carried into the post-polish backlog per D-010 | — |

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
- Copy Phase 0 skills into `.claude/skills/`.
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

**Goal:** Native agents become user-owned, user-configurable workspaces — with attached references, configurable tools, multi-format output, prompt caching, and a multi-vendor-ready directory structure. Phase 2 is a multi-session arc, originally scoped narrower (D-023) and expanded mid-phase (D-025).

**Already shipped in Phase 2:** Sessions 8a–31 plus polish items #1, #2, #5, #6, #9, #10, #11, #12. See `docs/CHATBOT_HANDOFF.md` for the full polish-list disposition and the three-tier agent architecture that resulted (Canonical / C4L / My Agents).

**Phase 2 work items — status:**

1. **`lib/anthropic/` → `lib/llm/anthropic/` refactor + vendor-prefixed model ids + single-case dispatcher** — SHIPPED (verified: `lib/llm/anthropic/` exists; `lib/anthropic/` removed).
2. **Schema extensions (migrations 0006–0008): agents extensions, `agent_attachments`, `message_attachments`, `formatted_outputs`, `usage_events` cache columns, RLS on every new table, Storage buckets and policies** — SHIPPED.
3. **Agent CRUD UI — create / edit form, fork-from-template, soft-delete with 30-day undo, My Agents + Templates separation** — SHIPPED (see `app/workspace/agents/new/`, `.../agents/[id]/`, `.../agents/trash/`, and the three-tier launchpad rendering per `docs/CHATBOT_HANDOFF.md`).
4. **Test Smoke Agent retirement** — SHIPPED (migration 0022).
5. **Permanent attachments — upload, server-side text extraction, `extracted_text` cache, attachments enter the cached prompt portion** — SHIPPED (migrations 0007/0008; see `lib/extract/`).
6. **Prompt caching wiring — `cache_control: { type: "ephemeral" }` markers, `cache_creation_tokens` / `cache_read_tokens` populated, updated cost math.** Required architecture per D-023 + D-025 in `DECISION_LOG.md`, not optimization — SHIPPED.
7. **Per-message file upload — paperclip in chat input, `message-attachments` bucket and table** — SHIPPED.
8. **Web search tool — Anthropic's built-in web search, `tools_enabled` validation, sources rendered inline, cost into `usage_events`** — SHIPPED (migration 0011).
9. **Word `.docx` export — server-side renderer, "Download as Word" button, `formatted_outputs` audit row** — DEFERRED. Per-message markdown download is wired today (`DownloadMessageButton`); full `.docx` document export remains in the README backlog.
10. **Six Commercial templates conversion + Blank Agent template** — SHIPPED (migration 0019 activated templates; the Blank Agent ships via the `0004_blank_agents.sql` seed).

**Analytics promotion (Phase 2 commitment, deferred).** localStorage-backed event logger (`lib/analytics/events.ts`) and per-browser admin metrics view shipped in Phase 1. The promotion to a Supabase `analytics_events` table — including cross-user/cross-device admin views — is still outstanding. Carried into the post-polish backlog per D-010; the admin metrics page (`app/workspace/admin/metrics/page.tsx`) explicitly notes the localStorage-only scope to users until D-010 closes.

**Definition of done (revised for polish-phase reality):** Users can create native agents from templates or from blank, attach references, enable web search, and have full chat conversations with streaming, prompt caching, and cost tracking. Six Commercial templates ship as the baseline catalog alongside the C4L imports. Word `.docx` export and the Supabase-backed analytics promotion remain explicit carve-outs deferred past polish-phase entry.

---

### Phase 3 — Superseded

Originally scoped as a single "M&A Department" rollout. Superseded by the broader department rollout across migrations 0012–0041: M&A renamed to Corporate (migration 0028) alongside additions of Regulatory, Compliance, Privacy, AI Governance, Employment, IP, and Litigation. See migrations 0012–0041 for the full sequence; current state is 13 departments organized into four clusters per the Phase 1 data model row above.

---

### Phase 4 — Superseded

Originally scoped as Public Sector + GR&RA + Privacy rollout. Superseded by the broader department rollout (see Phase 3 above). GR&RA no longer exists as a department — it was merged into Public Sector + General Tools in migration 0013. Public Sector, Privacy, and Regulatory are all live (migrations 0012–0037).

---

### Phase 5 — Agent Admin UI (~1 week)

**Goal:** Admin-level oversight surface over the user-owned agent estate.

**Admin shell shipped via Session 30** — admin landing (`app/workspace/admin/`), admin rail, and three working tools (User Access, Adoption Metrics, Productivity Calculator). `lib/admin/nav.ts` is the single source of truth that powers both the rail and the landing cards; adding a new admin tool is one entry there and both surfaces update. The Phase 5 items below are forward-looking and not yet built; the shell is ready to host them via `ADMIN_NAV_GROUPS` entries.

User-level agent create / edit ships in Phase 2 (per D-023 + D-025 in `DECISION_LOG.md` — every user creates and owns their own agents from templates or blank). Phase 5's scope is the residual admin work that does not belong in the per-user surface:

- Cross-user view of every agent in the organization (org_admin) and in a department (dept_admin).
- Force-disable / re-enable on any user-owned agent.
- Ownership transfer when a user leaves the organization.
- Audit trail: who created / edited / deleted / forked which agent, when. Reads from the existing soft-delete and (deferred) versioning data; if agent versioning ever lands (currently in the post-polish deferred-work list per `docs/CHATBOT_HANDOFF.md`), the audit view consumes it.
- Template management — adding / editing / retiring templates beyond the six Commercial + Blank Agent set that ships in Phase 2 (item 10 of Phase 2's remaining work).

**Definition of done:** An org_admin can see every agent in the organization, force-disable one if needed, transfer ownership, and view an audit trail of changes.

---

### Phase 6 — Multi-Vendor Model Adapters (~1 week)

**Goal:** Agents can run on OpenAI and Google models, not just Anthropic.

The directory structure (`lib/llm/<vendor>/`), the vendor-prefixed model id format (`anthropic/claude-sonnet-4-6`), the single-case dispatcher, the bounded model picker, and the multi-vendor pricing table all ship in Phase 2 (per D-023 in `DECISION_LOG.md` and Phase 2 work item 1 above). Phase 6's scope is the actual multi-vendor implementation against that structure:

- OpenAI adapter under `lib/llm/openai/`. Adds a case to the dispatcher; populates pricing table rows for the supported models.
- Google (Gemini) adapter under `lib/llm/google/`. Same pattern.
- Per-vendor caching strategy — Anthropic uses `cache_control` markers (already wired in Phase 2 per item 6); OpenAI caches automatically with no markers; Gemini sets cache headers per Google's API. Each adapter owns its caching strategy; the `usage_events` cache columns are vendor-neutral and each adapter populates them from its own SDK's response shape.
- Surface the new vendor models in the bounded model picker, so users can pick `openai/gpt-5.1` or `google/gemini-...` from the same dropdown that already offers Claude models.
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

### Phase 8 — Superseded

Originally scoped to add Compliance, Litigation, IP, and Product as departments. Compliance, Litigation, IP, Product — and additionally AI Governance, Employment, Regulatory — all shipped via migrations 0031–0037. Future verticals are DB inserts (with a migration per addition), not phases.

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

- **Phase status:** Phase 2 polish phase. The product surface is built; remaining work is polish-list resolution and roadmap construction.
- **Shipped:** Sessions 8a–31 plus polish items #1, #2, #5, #6, #9, #10, #11, #12. Latest commit at the time of this refresh: `4129375` (close polish #12 — C4L fork behavior verified; `default_output_format` preserved on fork).
- **In flight:** Polish #13 — documentation and external-copy refresh (this update is part of it).
- **Remaining polish:** #14 (agent placement audit — recurring discipline, no current action), #15 (button/card hover-effect refinement), #16 (sequenced roadmap construction from the deferred-work list).
- **After polish:** Step 3 — out-of-scope C4L plugins decision (law-student, legal-clinic, legal-builder-hub, cocounsel-legal) per polish #9 resolution. Step 4 — next product capability, operator's call.
