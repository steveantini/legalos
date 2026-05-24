# legalOS: CLAUDE.md

## Project Overview

legalOS — an operating system for legal departments. A multi-department, AI-native web app that gives lawyers and legal-ops staff a single, welcoming entry point to the agents and tools they use day-to-day — whether external (Gemini Gems, watsonX Orchestrate, custom links) or natively hosted inside the app.

legalOS is built to serve one corporate legal department at a time (single-tenant), with a multi-tenant-ready schema so the same codebase can later support a SaaS version for multiple legal departments. It ships with 13 departments organized into four product clusters — deal & transactional (Commercial, Corporate), regulatory & compliance (Regulatory, Public Sector, Compliance, Privacy, AI Governance), specialized practice (Product, Employment, IP, Litigation), and operational & utility (Operations, General Tools) — and is designed so adding more is mostly configuration.

Adoption is a first-class concern. The UI is deliberately simple, clean, modern, and welcoming. Behind that simple front end is real infrastructure: role-based access, a three-tier agent architecture (canonical Department Agents, Claude for Legal imports, user-owned My Agents), native chat with prompt caching, web search, attached references, per-message markdown download, soft-delete with 30-day undo, Supabase-backed analytics, a productivity gains calculator, and an admin area.

### Current Phase

**Phase 2 polish phase.** Three-tier agent architecture in place (Canonical Department Agents, Claude for Legal imports, user-owned My Agents) across a 13-department launchpad behind RBAC. Native chat with prompt caching, web search, attached references, per-message markdown download, soft delete + 30-day undo, and an admin area all shipped. Polish list (16 items) is the active workstream; doc refresh (#13) and sequenced-roadmap construction (#16) are the closing items.

---

## The dual-delight standard — non-negotiable, applies to every patch

Every code change, file edit, comment, commit message, and implementation choice must be evaluated against this question:

> *What would a top-line designer, developer, and product manager do if (1) they worked for a cutting-edge AI-native product on par with Apple, Linear, Vercel, Stripe, and Notion, and (2) they were optimizing for the most delightful experience from BOTH the end user's perspective AND the maintainer of the software's perspective?*

This is the default lens, not a special-occasion lens. It applies whether the work is large (a new feature) or small (a doc comment, a one-line copy change, a sort_order decision). The operator should never have to remind anyone to apply it.

Concretely:

- **For users:** UI behavior, animation, copy, error states, and edge cases should feel as thoughtful as Apple's most polished surfaces, as fast and clean as Linear's interaction model, as honest and quiet as Stripe's design voice, as discoverable as Notion's information architecture.
- **For maintainers:** code should read like the next engineer is a smart stranger who will inherit it without context — clear naming, durable abstractions, minimal cleverness, no implicit conventions, no fake symmetries.
- **For both:** decisions should be reversible where possible, defaults should be safe, and the "why" of a decision should be discoverable through code comments, doc updates, or commit messages.

When implementing a patch from Claude Chat:

1. If the patch instructions leave a small implementation detail open (variable name, helper placement, comment wording, etc.), choose what a top-line team would do — not the shortest path.
2. If the patch instructions appear to take a shortcut that violates this standard, flag it back to the operator before executing. Better to ask than to ship a shortcut.
3. If a better approach exists that the patch missed, flag it. The operator and Claude Chat have both established that careful re-checking against this standard is welcome — see prior session work where Claude Code's catches — like the seed-drift recognition (commit 05d7ee2), the description typo recognition (commit 057fd78), and the comment de-counting refinement (commit 7eb776b) — improved the product. That pattern of additive durability work continues.

Shortcuts are forbidden. Build for the long term, every time.

---

## Architecture

### Tech Stack

| Layer | Technology | Deployment |
|---|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui | Vercel |
| Backend | Next.js API routes + server actions | Vercel (same deploy) |
| Database | Supabase (PostgreSQL) with Row-Level Security | Supabase Cloud |
| Auth | Supabase Auth (magic link) | Supabase Cloud |
| AI / LLM | Anthropic API (Claude) for native agents; external links for Gemini Gems, watsonX, etc. | Server-side only |
| Analytics | localStorage today; Supabase promotion deferred per D-010 | Supabase Cloud |

### Directory Structure

High-signal structure, not exhaustive enumeration — directory contents shift; the categories below describe the durable shape of the repo:

```
legalos/
├── app/                          # Next.js App Router
│   ├── (marketing)/              # Public marketing pages
│   ├── (public)/                 # Public auth surfaces (login)
│   ├── workspace/                # Authenticated product surface
│   │   ├── departments/[slug]/   # Per-department launchpad
│   │   ├── agents/[id]/          # Agent chat + edit (also new/, trash/)
│   │   └── admin/                # Org admin surfaces
│   ├── api/                      # Route handlers (chat streaming, etc.)
│   ├── globals.css               # Global CSS
│   └── layout.tsx                # Root layout
├── components/                   # Reusable React components by domain
│   ├── workspace/                # Workspace shell (rail, hero, launchpad, cards)
│   ├── chat/                     # Chat composer, agent header, model picker
│   ├── admin/                    # Admin pages (users, agents, departments)
│   ├── marketing/                # Marketing page templates
│   ├── landing/                  # Marketing landing hero
│   ├── ui/                       # shadcn/ui primitives
│   └── …                         # Other component domains
├── lib/                          # Domain logic by product area
│   ├── actions/                  # Server actions (agents, departments, etc.)
│   ├── auth/                     # Access control, three-tier bucketing
│   ├── llm/anthropic/            # Anthropic API client + streaming
│   ├── agents/                   # Agent source resolution, attribution
│   ├── preferences/              # User preferences (rail collapse, etc.)
│   ├── workspace/                # Rail styles, launchpad helpers
│   └── …                         # Other lib domains
├── config/
│   └── site.ts                   # Branding, company name
├── supabase/
│   ├── migrations/               # SQL migrations (currently through 0041)
│   └── seed/                     # Seed SQL (departments, baseline agents)
├── styles/                       # See styles/README.md → DECISION_LOG D-016
├── .claude/
│   └── skills/                   # Routing rules for Claude Code (see Skill Routing Rules below)
├── docs/
│   ├── CHATBOT_HANDOFF.md        # Bootstrap doc for fresh chat sessions
│   ├── AGENT_ARCHITECTURE.md     # Native agent architecture reference
│   ├── C4L_DEFERRED_SKILLS.md    # C4L skills filtered to deferral surfaces
│   ├── DEMO_ACCESS_SCOPING.md    # Demo access spec (D-049)
│   └── design/aperture/          # Design artifacts (historical reference)
├── scripts/                      # One-off scripts (e.g., import-c4l-plugin.ts)
├── public/                       # Static assets
├── README.md                     # Top-level repo overview
├── PROJECT_OUTLINE.md            # Phases, data model, status
├── DECISION_LOG.md               # Append-only architectural decisions (D-000+)
├── CHANGELOG.md                  # Per-session/phase changelog
├── SETUP.md                      # Setup guide for new forks
├── CLAUDE.md                     # This file
├── .env.example                  # Env var template
└── proxy.ts                      # Auth proxy (Next.js 16 file convention, formerly middleware.ts)
```

### Data Flow

**External agent click (launchpad → third-party platform):**
User → Launchpad page → Click card → Log analytics event to Supabase → Open external URL in new tab.

**Native agent click (launchpad → in-app chat):**
User → Launchpad page → Click card → Navigate to `/agents/[id]` → Chat UI loads conversation history from Supabase → User sends message → Next.js server action → Anthropic API → Stream response to UI → Persist messages to Supabase.

**Critical constraints:**
- The Anthropic API key **never** leaves the server. All LLM calls go through Next.js route handlers or server actions.
- All data reads and writes to Supabase pass through Row-Level Security. Even if the frontend is compromised, the database is the last line of defense.
- No agent or department data is trusted from the client; the server re-validates the user's department access on every sensitive action.

---

## Coding Conventions

### TypeScript (Frontend + Backend)

- **File naming:** kebab-case for files, PascalCase for React components (`agent-card.tsx` exports `AgentCard`).
- **Imports:** external → internal absolute (`@/components/...`) → relative. One blank line between groups.
- **Server vs. client components:** default to server components. Add `"use client"` only when you need state, effects, or browser APIs. All Anthropic calls happen on the server — never in client components.
- **Type everything:** no `any`. Use `unknown` and narrow when data shape is uncertain. Database types come from generated Supabase types.
- **Error handling:** server actions and route handlers return discriminated unions `{ ok: true, data } | { ok: false, error }`. Never throw across trust boundaries.
- **Validation:** Zod schemas for all user input, all API request bodies, all env vars. Schema definitions live next to the code that uses them.
- **Async:** `async/await` only. No bare promise chains in application code.

### SQL (Supabase)

- **Migrations:** one migration per logical change, timestamped. Never edit a migration once merged.
- **RLS:** every table has RLS enabled from the moment it's created. No exceptions.
- **Policies:** policy names describe the rule in plain English (e.g., `users_can_read_own_conversations`).
- **Naming:** `snake_case` for tables and columns. Tables are plural (`users`, `agents`, `conversations`).
- **Foreign keys:** every foreign key has an index unless explicitly justified.
- **Timestamps:** every table has `created_at` and `updated_at` with defaults and triggers.

### Git

- **Commit format:** `type: description`
- **Types:** `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `security`, `db` (for schema/migration-only changes)
- **Branch naming:** `feature/description`, `fix/description`, `chore/description`, `db/description`
- **One logical change per commit.** Schema changes never mix with feature changes.

### Commit Consistency

Every commit must leave the codebase in an internally consistent state. No commit may reference symbols — ADR IDs, function names, files, modules, doc cross-links — that don't exist until a later commit.

When two changes are coupled by reference, either bundle them into one commit or order the commits so the referenced target lands first.

Why: broken intermediate states make `git bisect` unreliable, complicate PR review, and turn future readers of the history into archaeologists. A commit should build, lint, and read coherently when checked out in isolation.

---

## Copy Conventions

**Em-dashes are banned in user-facing copy.** Em-dashes have become a recognizable AI-authored signal, and any credibility cost on a customer-facing surface compounds. Use commas, periods, parentheses, or semicolons instead. The constraint applies to:

- Marketing pages under `app/(marketing)/`
- The landing surface at `app/page.tsx` and its components
- In-product copy in `components/workspace/`, `components/chat/`, `components/admin/`, etc.
- Any string literal that renders to a user

Internal documentation (`CLAUDE.md`, `PROJECT_OUTLINE.md`, `DECISION_LOG.md`, `CHANGELOG.md`, `docs/CHATBOT_HANDOFF.md`, etc.) and code comments may use em-dashes, but sparingly.

A comprehensive em-dash sweep of existing external-facing copy is tracked as a polish-list item.

---

## Environment & Configuration

- **Environment variables:** `UPPER_SNAKE_CASE`. Client-exposed vars must be prefixed `NEXT_PUBLIC_`; all others stay server-only.
- **Secrets:** never hardcoded, never committed. `.env.local` for dev, Vercel env vars for preview/prod. `.env.example` is the canonical list of required variables.
- **Environments:** separate Supabase projects and Vercel environments for dev, preview, and production. Never share a database across environments.
- **Anthropic API keys:** server-side only. `ANTHROPIC_API_KEY` (no `NEXT_PUBLIC_` prefix, ever). If you ever see `NEXT_PUBLIC_ANTHROPIC_...` anywhere in this codebase, that is a critical security bug — stop and fix it before continuing.

---

## Testing

- **Unit tests:** colocated as `*.test.ts` next to the code they test. Business logic, auth helpers, and validation schemas are always tested.
- **Integration tests:** Supabase RLS policies are tested against a local Supabase instance. Every policy has at least one positive and one negative test.
- **E2E tests:** Playwright for critical flows — login, department access, agent chat, admin dashboard. Kept small and stable.
- **What must be tested:** all RLS policies, all server actions, all role checks, all validation schemas.
- **What can be tested lightly:** presentational components, static pages.

---

## Security Non-Negotiables

- **Anthropic API key is server-only.** Never `NEXT_PUBLIC_`, never in a client component, never in a client-side fetch.
- **RLS on every table.** A table without RLS is a production incident waiting to happen.
- **Role checks on every sensitive server action.** Client-side role checks are UX, not security — the server re-verifies.
- **No PII in logs.** Log user IDs (UUIDs), never emails, names, or message content. Redact before structured logging.
- **No client-rendered markdown without sanitization.** Chat responses are sanitized before render to prevent prompt-injection-driven XSS.
- **Rate limiting on every route handler that calls Anthropic.** Per-user and per-org limits.
- **CORS locked** to the app's own origin. No wildcard origins in production.
- **Input validation with Zod** at every trust boundary.
- **Admin routes double-gated:** the Next.js proxy (`proxy.ts`) checks role, and RLS policies re-enforce at the DB level.

---

## AI Integration Rules

This app handles attorney work product, and in some future deployments may handle privileged or confidential information. Treat every AI integration accordingly.

- **All Anthropic API calls happen server-side.** No exceptions.
- **System prompts live in the database** (`agents` table), not in code, so they can be updated without a deploy. System prompts are loaded server-side and never exposed to the client.
- **Prompt templates are versioned.** Every change to an agent's system prompt creates a new version row; old conversations retain their original prompt for reproducibility.
- **User messages are validated** against a max length and a content-type allowlist before being sent to the model.
- **Model output is treated as untrusted.** Any content rendered in the UI is sanitized. Any action triggered by model output (tool use, agentic behavior) requires explicit user confirmation in the chat, not inferred intent.
- **Prompt injection defense:** system prompts include explicit instructions that user-supplied content is data, not instructions. Tool-use flows (when added) verify every action with the user.
- **Cost tracking from day one of native agents.** Every Anthropic call logs tokens in / tokens out / model / user / department / agent ID to a `usage_events` table.
- **Rate limiting per user and per organization.** Default tier limits configurable per deployment.
- **Conversations are scoped by user.** A user can never see another user's conversations, even within the same department. RLS enforces this.
- **No training on customer data.** Anthropic API calls use the standard API, which does not train on inputs. Document this clearly in the privacy page.

---

## What Not to Do

- Do not put the Anthropic API key in any file reachable by the browser.
- Do not create a table without RLS enabled.
- Do not disable RLS "temporarily" for debugging. Write a policy instead.
- Do not trust `user.id` from the client. Always read it from the Supabase server session.
- Do not hardcode department lists or agent lists in frontend code; they live in the database.
- Do not log raw message bodies or email addresses.
- Do not render model output as HTML without sanitization.
- Do not call external APIs from client components. Route every external call through a server action or route handler.
- Do not skip the DECISION_LOG update when making an architectural choice. Future-you will not remember why.
- Do not add a new department by duplicating pages — departments are dynamic routes driven by the `departments` table.

---

## Reference Ports (Constraint C)

When a feature is being ported from an upstream reference (currently the prior `agent-launchpad-template`, located at `../agent-launchpad-template/` relative to this repo, and any future reference repos this project draws from), you must read the original first and replicate it field-for-field, formula-for-formula, interaction-for-interaction.

**Why:** paraphrased descriptions of UX leak content. Ports built against a description rather than the source drift in subtle, compounding ways — field labels shift, formulas get "simplified," interactions get "improved." The reference is the source of truth for behavior; only the visual style is allowed to drift (per Constraint B — shadcn defaults, no theme port).

**How to apply:**

1. Locate the original file(s) in the reference repo before writing any code. Read them verbatim — do not skim.
2. Replicate every input, every formula, every derived value, every storage key, every CSV column, every modal copy string, exactly. Number-format strings (e.g., locale + minimum/maximum fraction digits) match the original.
3. Visual style follows Constraint B: shadcn defaults, no port of the original's color palette, fonts, gradients, or brand styling. Layout structure (grids, ordering, button placement) does follow the original.
4. Any deviation from the original's behavior must be explicitly documented in DECISION_LOG.md as an exception, with the reason. "I thought this was cleaner" is not a reason.
5. If the original has a feature this project has decided not to port (e.g., the original's password gate, replaced here by middleware-based RBAC), call that out in the relevant DECISION_LOG entry so future reviewers can match the source against the port.

This applies to every reference port from this point forward. Sessions that port functionality begin with a verbatim read of the source; the plan presented to the user names the specific source files and line ranges read.

---

## Documentation Rules

When making any product change (new feature, renamed component, new page, architectural change, design system change, or brand update), the following files must be checked and updated if affected:

- **README.md**: project overview, setup instructions, feature list, routes, project structure
- **PROJECT_OUTLINE.md**: roadmap, technical architecture, phase status
- **DECISION_LOG.md**: any decision worth recording
- **CLAUDE.md**: new conventions, components, architecture changes
- **CHANGELOG.md**: what was built, what was fixed, date
- **.env.example**: any new environment variables
- **SETUP.md**: any change that affects how someone forks and runs this template

This is not optional. Documentation updates are part of the definition of done for every change.

At the end of every phase or significant feature completion, sync generalized lessons back to the portable `claude-templates` library. Extract the universal principle, not the project-specific detail. If a new rule or convention is added to this project's CLAUDE.md, evaluate whether it belongs in the template CLAUDE.md as well.

### Session Close Protocol

Before declaring a session done, triple-check that what was reported shipped is actually in `origin/main`:

1. `git status` — must show `working tree clean`. Anything modified or untracked is unshipped work.
2. `git log --oneline` — recent commits must include the session's deliverables.
3. `git rev-parse HEAD` vs `git rev-parse origin/main` — must match. A local-only commit is not a shipped commit.

Why: Session 5 closed with the entire admin shell uncommitted, despite reporting "done." The Session 5 fix audit caught the gap by running this triple-check explicitly; adopting it as session-close discipline prevents recurrence.

---

## Skill Routing Rules (Mandatory)

Before performing any of the following types of work, you MUST read the specified skill file(s) in `.claude/skills/` and follow their conventions. Do not rely on memory from previous sessions; re-read the skill file every time.

| Task Type | Read First | Examples |
|---|---|---|
| Any frontend work | `nextjs.md` + `react-patterns.md` + `tailwind.md` | Components, pages, layouts, styling |
| Any UI/UX decision | `ui-patterns.md` + `responsive-design.md` + `ux-writing.md` | Component design, error copy, empty states |
| Any accessibility concern | `web-accessibility.md` | Forms, navigation, modals, keyboard flows |
| Any backend/API work | `api-security.md` + `backend-security.md` | Route handlers, server actions, proxy (`proxy.ts`) |
| Any database work | `supabase.md` + `database-patterns.md` + `database-security.md` | Schema changes, migrations, queries, RLS policies |
| Any auth work | `supabase.md` + `backend-security.md` + `api-security.md` | Login, role checks, session handling |
| Any AI/prompt work | `anthropic-api.md` + `prompt-engineering.md` | System prompts, Claude API calls, streaming |
| Any deployment/env work | `vercel-deployment.md` + `environment-management.md` + `infra-security.md` | Build config, env vars, preview deploys |
| Any frontend security concern | `frontend-security.md` | CSP, XSS prevention, cookie handling |
| Any analytics or cost work | `analytics.md` + `cost-tracking.md` | Event tracking, dashboards, token logging |
| Any model provider change | `model-abstraction.md` | Adding OpenAI, Google, or other providers |
| Any eval or quality work | `eval-framework.md` + `observability.md` | Regression tests, tracing, monitoring |
| Any CI/CD work | `ci-cd.md` | GitHub Actions, PR checks, deploy gates |
| Any work touching multiple domains | Read ALL relevant skills | Full-stack features, new phases |

If you are unsure whether a skill applies, read it anyway. It is always better to over-consult than to miss a convention.

If a task requires a skill that does not exist in `.claude/skills/` yet but exists in the `claude-templates` library, copy it into the project first, then read it.

---

## Skill Template Sync Convention

At the end of every phase or sub-phase, after completing the standard documentation updates above, you **MUST** also sync any new patterns, lessons, or gotchas discovered during that phase to the portable skill templates at `<claude-templates>/skills/`.

### Sync Process

1. **Review** every project-specific skill file in `.claude/skills/` that was referenced or updated during this phase.
2. **Extract the generalized principle.** Strip out project-specific details (project names, specific API keys, specific database tables, specific design tokens) and keep the universal best practice.
3. **Update** the corresponding portable template skill file with the generalized version.
4. **Create new templates.** If a new skill file was created for this project that doesn't have a portable template equivalent yet, create one in the appropriate subdirectory of `<claude-templates>/skills/`.
5. **Version bump.** Add a version bump and "Last updated" date to any modified template skill files.

### Example

If during a phase you discover that Supabase RLS policies behave differently when a service-role key is used on joined tables, the project skill gets the specific fix. The portable template gets: "When using admin/service role keys that bypass row-level security, verify behavior on queries involving joins, as RLS policies may not propagate across joined tables as expected."

**This is not optional.** No phase is complete until both project-specific skills AND portable templates are current.
