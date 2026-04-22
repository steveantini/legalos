# Legal Department AI Launchpad Template: Decision Log

A running record of architectural decisions, with context, the decision, and the reasoning. New decisions are appended; old decisions are not edited — if a decision is reversed, add a new entry referencing the old one.

Format for each entry:

```
## D-NNN — Short title
Date: YYYY-MM-DD
Status: Accepted | Superseded by D-NNN | Reversed
Context: What situation forced the decision.
Decision: What we chose.
Reasoning: Why.
Alternatives considered: What else we looked at.
Consequences: What this commits us to.
```

---

## D-001 — Project scope: multi-department legal AI launchpad, not just Commercial

Date: 2026-04-21
Status: Accepted

**Context:** The prior `agent-launchpad-template` was framed around a single use case (Commercial contract review). The goal is a holistic in-house legal department AI entry point covering multiple departments over time.

**Decision:** Build a single app that supports multiple legal departments — Commercial, M&A, Public Sector, GR&RA, Privacy at launch, with Products, Compliance, Litigation, IP on the roadmap.

**Reasoning:** Legal departments are multi-disciplinary. A single unified launchpad drives far higher adoption than five separate micro-apps. Shared infrastructure (auth, analytics, admin, productivity calculator) is built once. A new department is a row in a table, not a new repo.

**Alternatives considered:**
- One repo per department. Rejected — too much duplicated infrastructure.
- A monorepo with per-department packages. Rejected for now — adds complexity with no current payoff.

**Consequences:** Departments must be data-driven from Phase 1. Routing, nav, RLS policies, and admin must all understand "which department."

---

## D-002 — Single-tenant deployment, multi-tenant-ready schema

Date: 2026-04-21
Status: Accepted

**Context:** The immediate use case is a single in-house legal department. The long-term possibility is a SaaS offering for multiple legal departments.

**Decision:** Build as a single-tenant app today, but carry `organization_id` on every relevant table from day one. Do not do full multi-tenant (signup flow, billing, tenant isolation tests) until/unless a SaaS decision is made.

**Reasoning:** Adding `organization_id` on day one is a two-line change per table; adding it later is a painful migration. Full multi-tenancy (Stripe, signup, isolation testing) is expensive and premature.

**Alternatives considered:**
- Skip `organization_id` entirely. Rejected — makes a future SaaS move a rewrite.
- Build full multi-tenancy now. Rejected — YAGNI; delays real user value.

**Consequences:** Every table that holds org-scoped data has `organization_id`. RLS policies check it even though there's one organization today. Adding the signup/billing layer later is scoped, not architectural.

---

## D-003 — Database-driven agent definitions

Date: 2026-04-21
Status: Accepted

**Context:** Agent configs (name, description, system prompt, model, department) could live in config files (YAML/JSON) or in the database.

**Decision:** Agents are database rows. Their metadata, system prompts, and version history live in Supabase.

**Reasoning:** A config-file approach means every new agent or prompt tweak is a PR + deploy. A database approach unlocks the Phase 5 agent admin UI where legal ops staff can create and edit agents themselves. That is a major adoption lever — when the people closest to the work can tune the tools without filing a ticket, adoption compounds.

**Alternatives considered:**
- YAML files in the repo. Rejected — bottlenecks updates on engineering.
- Hybrid (config files + DB overrides). Rejected — two sources of truth are always worse than one.

**Consequences:** System prompts are loaded at request time. They must be versioned so in-flight conversations don't break mid-stream when a prompt changes. The admin UI (Phase 5) is now a required feature, not optional.

---

## D-004 — Role-based access with per-department permissions

Date: 2026-04-21
Status: Accepted

**Context:** Three options for user access: (a) all users see all departments, (b) one department per user, (c) role-based with per-department permissions.

**Decision:** Option (c). Users have roles (`super_admin`, `org_admin`, `dept_admin`, `user`) and independent per-department access rows in a `user_department_roles` join table. A user can be a `dept_admin` for Commercial and a `user` for M&A.

**Reasoning:** Legal departments have real access patterns — M&A data is often walled off from the rest of the department; privacy data sometimes is; public sector work may be sensitive. Option (a) fails a basic legal-industry smell test. Option (b) is too restrictive — many lawyers legitimately work across departments.

**Alternatives considered:**
- Option (a), all-access. Rejected — doesn't meet the realistic sensitivity profile of a legal department.
- Option (b), one department per user. Rejected — too rigid.

**Consequences:** Every query for department-scoped data filters by `user_department_roles`. Every RLS policy on a department-scoped table joins to that table. Navigation is filtered at the UI level for UX, and re-enforced at the DB level for security.

---

## D-005 — Hosting and backend: Vercel + Supabase, Next.js full-stack

Date: 2026-04-21
Status: Accepted (after two reversals — see D-005a and D-005b below)

**Context:** Hosting, backend language, and framework choice.

**Decision:** Host on Vercel. Use Next.js 15 (App Router) for both frontend and backend (API routes + server actions). Use Supabase for database and auth. TypeScript end-to-end.

**Reasoning:** Vercel + Next.js + Supabase is the most paved-path stack for this shape of app. The user's `claude-templates` library is already optimized for this exact stack, meaning ~24 of 25 skills apply directly. Server-side secrets are straightforward (Vercel env vars); streaming LLM responses are a first-class feature; preview deploys per branch are automatic; Supabase RLS provides a real security layer without running a separate auth service.

**Alternatives considered:**
- Python/FastAPI backend as a separate service (D-005a, reversed). Rejected — adds a second language and a separate deploy target for no current benefit.
- Vite + React + TypeScript on GitHub Pages (D-005b, reversed). Rejected once the hosting target moved to Vercel — the static-hosting constraints that justified Vite no longer apply.

**Consequences:** One deploy target, one language, one set of conventions. `vercel-deployment.md` and `nextjs.md` skills apply directly. Server actions are the default for mutations; route handlers for anything that needs a stable HTTP contract.

### D-005a — Python/FastAPI backend (reversed)
Briefly considered for the backend. Reversed in favor of Next.js API routes because a separate Python service adds complexity without current payoff, and because TypeScript everywhere reduces context-switching for solo development.

### D-005b — Vite + React on GitHub Pages (reversed)
Briefly adopted when GitHub Pages was the planned host. Reversed when hosting moved to Vercel — Vite on static hosting was a workaround for not having a server, and the server is back.

---

## D-006 — Auth: Supabase Auth with email/password + magic link

Date: 2026-04-21
Status: Accepted

**Context:** Initial authentication method for Phase 1.

**Decision:** Supabase Auth with email/password and magic link.

**Reasoning:** Fastest path to a working login for a single-org demo. Magic link reduces password-management friction for demos and internal pilots. Google and Microsoft SSO can be added later without changing the underlying auth layer.

**Alternatives considered:**
- Google SSO only. Deferred — legal departments do live on Google Workspace or Microsoft 365, but locking in one SSO provider in Phase 1 is premature.
- Third-party auth service (Clerk, Auth0). Rejected — Supabase Auth is sufficient and avoids an extra vendor.

**Consequences:** SSO providers (Google, Microsoft) are added in a later phase. Auth flow, session handling, and middleware are designed so adding a provider is drop-in.

---

## D-007 — Name: `legal-department-launchpad-template`

Date: 2026-04-21
Status: Accepted (amended 2026-04-21)

**Context:** The project needs a repo name. Codename discussion floated Atrium, Aegis, Keystone, Chambers, Docket; working titles included `legal-department-launchpad-demo` and `in-house-legal-department-template`.

**Decision:** `legal-department-launchpad-template`.

**Reasoning:** "Legal department" scopes it to the target user. "Launchpad" inherits the mental model from the prior `agent-launchpad-template`. "Template" signals fork-ability. The AI-native positioning is conveyed in README and marketing copy rather than in the repo slug — a shorter name is easier to type, remember, and read in CLIs.

**Alternatives considered:** Atrium (memorable but opaque), `legal-department-launchpad-demo` (reads as throwaway), `in-house-legal-department-template` (too generic about "what" the template is), `legal-department-ai-launchpad-template` (originally accepted; see amendment).

**Consequences:** README and docs lean into "template" and "fork this to your org" framing. AI-native positioning is communicated in prose, not the slug.

**Amendment (2026-04-21):** Originally accepted as `legal-department-ai-launchpad-template`. Renamed to `legal-department-launchpad-template` to shorten the slug and avoid "AI" becoming dated vocabulary in the repo name itself. The GitHub repo was renamed accordingly; the old URL continues to redirect.

---

## D-008 — Native agent API calls are server-only; API keys never reach the browser

Date: 2026-04-21
Status: Accepted

**Context:** Native agents require calling the Anthropic API. There are three ways to do it: from the browser with a user-supplied key (BYOK), from the browser with a bundled key (insecure), or server-side only.

**Decision:** All Anthropic API calls happen server-side. The `ANTHROPIC_API_KEY` environment variable is server-only and never prefixed with `NEXT_PUBLIC_`.

**Reasoning:** With Vercel hosting, we have a real server, so the temporary workaround of BYOK for static hosting no longer applies. Server-side calls give us rate limiting, cost tracking, prompt-injection defense centralized in one place, and a single place to rotate keys.

**Alternatives considered:**
- BYOK (user supplies key from browser). Rejected once Vercel hosting was chosen — it was a static-hosting workaround.
- Bundling a key in the client. Rejected — that's a credential leak.

**Consequences:** All chat routes are route handlers or server actions. Client components call the server, not Anthropic directly. Cost tracking, rate limiting, and prompt-injection defense happen in one place.

---

## D-009 — Row-Level Security on every table from table creation

Date: 2026-04-21
Status: Accepted

**Context:** RLS is optional in Postgres/Supabase. Many teams turn it on late or partially.

**Decision:** Every table in this project has RLS enabled from the moment it is created. Every table has explicit policies before any data is inserted. A table with no policies has zero access — which is the safe default.

**Reasoning:** Defense in depth. If middleware is misconfigured, if a server action forgets a role check, if a client is compromised — RLS is the last line that stands. Retrofitting RLS onto a table that already has data is a minefield.

**Alternatives considered:**
- RLS on "sensitive" tables only. Rejected — "sensitive" is a moving target, and every table in this app touches org-scoped data.
- RLS later, after schema stabilizes. Rejected — retrofitting is painful and error-prone.

**Consequences:** Every migration that creates a table is paired with RLS policies. RLS policies are tested with positive and negative integration tests.

---

## D-010 — Analytics start in localStorage in Phase 1, move to Supabase in Phase 2

Date: 2026-04-21
Status: Accepted

**Context:** The prior `agent-launchpad-template` uses localStorage for analytics. The new project could start with real backend analytics from Phase 1.

**Decision:** Phase 1 keeps localStorage analytics (inherited from the prior template's pattern). Phase 2 promotes to a Supabase `analytics_events` table when the real shape of events is clearer from a working system.

**Reasoning:** Premature schema design for analytics tends to produce tables you regret. Running Phase 1 with localStorage gives us 1-2 weeks of real-world event shapes to observe before committing to a schema. The migration from localStorage to Supabase is small and localized.

**Alternatives considered:**
- Supabase analytics from Phase 1. Rejected — we don't yet know the event shape we actually need.
- Third-party analytics (Plausible, PostHog). Deferred — adds a vendor dependency and isn't needed at current scale. Reconsider in Phase 7.

**Consequences:** An analytics migration is on the Phase 2 checklist. The abstraction in `lib/analytics/` is designed so the storage backend is swappable without touching the call sites.

---

## D-011 — Skill adoption: start with ~11 Phase 0 skills; reach ~24 of 25 by Phase 7

Date: 2026-04-21
Status: Accepted

**Context:** The `claude-templates` library has 25 skill files. Not all apply immediately.

**Decision:** Copy 11 skills in Phase 0 (`nextjs`, `react-patterns`, `tailwind`, `ui-patterns`, `responsive-design`, `ux-writing`, `web-accessibility`, `environment-management`, `vercel-deployment`, `frontend-security`, `infra-security`). Add 5 more in Phase 1 (`supabase`, `database-patterns`, `database-security`, `backend-security`, `api-security`). Add 2 more in Phase 2 (`anthropic-api`, `prompt-engineering`). Add the remaining analytics, model-abstraction, eval, observability, cost-tracking, ci-cd, and possibly mcp-development skills in Phases 6 and 7.

**Reasoning:** Copying all 25 on day one buries the signal. Copying them as they become relevant keeps `.claude/skills/` focused and encourages re-reading when they matter.

**Alternatives considered:** Copy all 25 at once. Rejected — noise over signal.

**Consequences:** Every phase has an explicit "skills to add this phase" line item. Skill template sync (the convention from the `claude-templates` repo) runs at the end of every phase.

---

## D-012 — Documentation discipline: six docs kept current, per-change updates are mandatory

Date: 2026-04-21
Status: Accepted

**Context:** The prior template already established this convention; restating it here for clarity.

**Decision:** Six docs are kept current throughout the project: `README.md`, `CLAUDE.md`, `PROJECT_OUTLINE.md`, `DECISION_LOG.md`, `SETUP.md`, `CHANGELOG.md`. A change is not "done" until affected docs are updated.

**Reasoning:** Documentation debt compounds faster than code debt on solo-developer projects with AI assistance. The cost of keeping docs current is small per-change; the cost of reconstructing intent three months later is enormous.

**Alternatives considered:** Less doc discipline. Rejected — already learned this lesson on prior projects.

**Consequences:** Every PR/commit that changes product behavior updates relevant docs. Every phase ends with a sync back to the `claude-templates` library.

---

## D-013 — Framework version: Next.js 16 (not 15)

Date: 2026-04-22
Status: Accepted

**Context:** Phase 0 Session 2's `create-next-app@latest` invocation installed Next.js 16.2.4 and React 19.2.4. `CLAUDE.md`, `PROJECT_OUTLINE.md`, and `README.md` had previously stated "Next.js 15" based on the last version the author had been using elsewhere.

**Decision:** Accept Next.js 16. Update `CLAUDE.md`, `PROJECT_OUTLINE.md`, and `README.md` so the docs match the scaffold. D-005 (full-stack Next.js on Vercel) stands; only the version detail is superseded here.

**Reasoning:** Starting a brand-new template on a lagging major is debt we don't want to accrue. Next.js 16 is current stable, the scaffolder's default, and has a supported upgrade path. We have no production dependency requiring a pin to 15, and the marginal breaking changes are survivable in Phase 0.

**Alternatives considered:** Downgrade by pinning `next@^15` and reinstalling — preserves the doc claim but starts us one major behind immediately. Rejected.

**Consequences:** AI-assisted code may need to consult Next.js 16 docs for APIs that differ from 15 (Cache Components, updated PPR and caching conventions, etc.). The `nextjs.md` skill gets a "Next.js 16 specifics" section when copied in Step 5, absorbing the warning content from the scaffold's `AGENTS.md` (which is then deleted).

---

## D-014 — Styling: Tailwind CSS v4 (not v3)

Date: 2026-04-22
Status: Accepted

**Context:** The same Session 2 scaffold installed Tailwind CSS v4. v4 is architecturally different from v3: CSS-first configuration via `@import "tailwindcss"` and the `@theme` directive, rather than a JS `tailwind.config.ts` with `theme.extend`. This project's theme-preset approach (Carbon / Modern / Minimal / Custom), ported from the prior `agent-launchpad-template`, was designed against v3.

**Decision:** Accept Tailwind v4.

**Reasoning:** v4 is the ecosystem direction. Its CSS-variable-first model and `@theme` directive map more cleanly onto our theme-preset approach than v3's JS config did — CSS variables were always the underlying mechanism, and v4 makes them first-class. Downgrading to v3 to preserve compatibility with a `claude-templates` skill file written against v3 is backwards.

**Alternatives considered:** Downgrade to Tailwind v3 for direct carry-over of the prior template's theme tokens. Rejected — v3 is a dead end for new work.

**Consequences:**
- The project-local adaptation note at the top of `.claude/skills/tailwind.md` (applied in Step 5) is rewritten to describe v4's `@theme` directive and CSS-variable pattern. `skills-checklist.md` is updated in lock-step so the checklist's adaptation guidance matches what Step 5 will actually write.
- The upstream `claude-templates/skills/frontend/tailwind.md` is written against v3. Flagged as an explicit Phase 0 end-of-phase skill-sync item: generalize the v4 pattern back to the portable template.
