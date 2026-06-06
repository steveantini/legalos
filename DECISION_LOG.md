# legalOS: Decision Log

A running record of architectural decisions for legalOS, with context, the decision, and the reasoning. New decisions are appended; old decisions are not edited — if a decision is reversed, add a new entry referencing the old one.

Entries D-001 through D-025 reference the project by its previous name, "Legal Department Launchpad Template" / `legal-department-launchpad-template`. Those are preserved verbatim per the standing rule that decision-log history is immutable. The rename to legalOS is recorded in D-026.

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
Status: Amended by D-018 (2026-04-23) — magic link only

**Context:** Initial authentication method for Phase 1.

**Decision:** Supabase Auth with email/password and magic link.

**Reasoning:** Fastest path to a working login for a single-org demo. Magic link reduces password-management friction for demos and internal pilots. Google and Microsoft SSO can be added later without changing the underlying auth layer.

**Alternatives considered:**
- Google SSO only. Deferred — legal departments do live on Google Workspace or Microsoft 365, but locking in one SSO provider in Phase 1 is premature.
- Third-party auth service (Clerk, Auth0). Rejected — Supabase Auth is sufficient and avoids an extra vendor.

**Consequences:** SSO providers (Google, Microsoft) are added in a later phase. Auth flow, session handling, and the proxy (`proxy.ts`, per D-017) are designed so adding a provider is drop-in.

**Amendment (2026-04-23 — see D-018):** After shipping magic link in Session 3a and the email/password form in Session 3c, we re-evaluated whether to keep the password form in Phase 1 scope. Decision: drop it. Magic link alone is a complete auth solution and avoids the password-set / password-reset / strength-rules / rate-limiting sub-features a password form implies. See D-018 for the full reasoning.

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

**Reasoning:** Defense in depth. If the proxy (`proxy.ts`) is misconfigured, if a server action forgets a role check, if a client is compromised — RLS is the last line that stands. Retrofitting RLS onto a table that already has data is a minefield.

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

---

## D-015 — Component primitives: shadcn/ui on Base UI (not Radix)

Date: 2026-04-22
Status: Accepted

**Context:** shadcn/ui 4.x (4.4.0 at the time of Phase 0 Session 2) restructured its CLI and default component model. The `--defaults` preset for `init` expands to `--template=next --preset=base-nova`, which targets shadcn's own Base UI primitive library (`@base-ui/react`) rather than the Radix primitives shadcn used for years. Session 2's scaffold accepted `--defaults` and landed on Base UI.

**Decision:** Accept Base UI.

**Reasoning:** Same logic as D-013 (Next.js 16) and D-014 (Tailwind v4) — for a template that will be long-lived, ecosystem direction matters more than the comfort of the previous default. shadcn's own docs and future components target Base UI; Radix is being framed as a legacy option. Starting a new template on the legacy option is debt we don't want to accrue. Base UI and Radix have comparable consumer APIs, so the replatform cost later would be higher than the adaptation cost now.

**Alternatives considered:** Re-init with `-b radix` to stay on Radix primitives. Rejected — Radix was shadcn 3.x's default; shadcn 4.x is moving to Base UI.

**Consequences:** `components.json` records `"style": "base-nova"` and Base UI is installed as `@base-ui/react`. Any subsequent `shadcn add <component>` pulls the Base-UI-flavored variant. If a specific primitive we need is not yet matched in Base UI, we can consume Radix directly as a peer dep for that one component rather than replatforming.

---

## D-016 — Directory structure: narrow root, `lib/` as home for actions and hooks

Date: 2026-04-23
Status: Accepted

**Context:** The `nextjs.md` skill recommended a broader top-level layout with `actions/`, `hooks/`, `types/`, and `styles/` all at the repo root. `CLAUDE.md`'s original directory structure was narrower — `app/`, `components/`, `lib/`, `config/`, `supabase/`, `.claude/`, `public/` — and did not specify where server actions, custom hooks, or TypeScript types should live.

**Decision:** Keep `CLAUDE.md`'s narrow set. Server actions live in `lib/actions/`. Custom hooks live in `lib/hooks/`. Types live inline next to the code that uses them (no top-level `types/`). Add `styles/` at the top level, because global CSS grows quickly in a template.

**Reasoning:** Single source of truth wins over anticipated discovery. For AI-assisted solo development, a doc that accurately describes the repo is more valuable than a layout that self-announces. Promote `lib/actions/` or `lib/hooks/` to top-level the first time either exceeds ~8 files.

**Alternatives considered:** Pre-create `actions/`, `hooks/`, `types/` at root now with `.gitkeep` files — rejected, empty dirs are noise. Accept the full `nextjs.md` recommendation wholesale — rejected, `CLAUDE.md` is the project's authority, not the skill.

**Consequences:** `CLAUDE.md` remains the authoritative directory map. The `nextjs.md` skill differs from this project's choice; that is acceptable because the skill is a portable template and this is a project. `CLAUDE.md`'s directory structure is updated in lock-step with this entry to list `styles/`, `lib/actions/`, and `lib/hooks/`.

---

## D-017 — Next.js 16 proxy file convention (formerly middleware)

Date: 2026-04-23
Status: Accepted

**Context:** Session 3b's first `npm run build` produced a Next.js 16 deprecation warning: *"The 'middleware' file convention is deprecated. Please use 'proxy' instead."* Per `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`, Next.js 16 renamed the feature — API unchanged, only the filename (`middleware.ts` → `proxy.ts`) and the exported function name (`middleware` → `proxy`) change.

**Decision:** Use `proxy.ts` at repo root. Rename the exported function to `proxy`. Keep internal helper filenames like `lib/supabase/middleware.ts` for filename stability; update docstrings and prose to say "proxy" where the reference is to the Next.js file convention.

**Reasoning:** Template-repo discipline. The deprecation is current as of Next 16.2.4 and may become a hard removal in a future major. Shipping a fork-able template on the deprecated convention would be a quiet gift of tech debt to every forker. Per the project-local adaptation note at the top of `.claude/skills/nextjs.md`: "Heed deprecation notices."

**Alternatives considered:** Ship on the deprecated `middleware.ts`. Build still works with only a warning. Rejected — template expected to live multiple Next.js majors, and forkers who upgrade will hit the removal first.

**Consequences:**
- `middleware.ts` → `proxy.ts` at repo root; exported function renamed.
- `lib/supabase/middleware.ts` and `createSupabaseMiddlewareClient` keep their names; their docstrings clarify the intended use site is `proxy.ts`.
- CLAUDE.md, PROJECT_OUTLINE.md, and surrounding code comments are updated in lock-step.
- `PHASE_0_SYNCBACK_TODO.md` now tracks an additional update to the upstream `skills/frontend/nextjs.md`: rename its "Middleware" section to "Proxy" (and keep a cross-reference for Next.js ≤15 users). Bundled with D-016's layout-flexibility note under the same sync-back item.

---

## D-018 — Magic link is sole auth method for Phase 1 (amends D-006)

Date: 2026-04-23
Status: Accepted

**Context:** D-006 called for email/password + magic link. After shipping magic link in Session 3a, we evaluated whether to add the password form.

**Decision:** Ship magic link only. Drop email/password from Phase 1 scope.

**Reasoning:** Magic link alone is a complete auth solution. It handles first-touch signup, returning users, and password-forgetting users in a single flow — no password reset plumbing ever needed. Shipping password auth would add a password-set flow, password reset flow, password strength rules, and rate limiting considerations. Scope discipline wins; every phase that skips a feature is a phase that ships faster. Forkers who need SSO or password auth can add it against the existing `@supabase/ssr` foundation.

**Alternatives considered:**
- Shipping password auth in Phase 1. Rejected — adds four sub-features to test a form.
- Deferring password auth to a later phase with a TODO. Rejected — ambiguous TODOs rot.

**Consequences:** D-006 is amended. `SETUP.md`, `README.md`, `CLAUDE.md`, and `PROJECT_OUTLINE.md` references to email/password have been updated or removed in the same commit. SSO providers (Google, Microsoft) remain on the roadmap for a later phase and will be added against the same `@supabase/ssr` foundation. The email/password form code shipped in Session 3c (`app/(public)/login/page.tsx`, `app/(public)/login/actions.ts`) remains in the tree at the time of this ADR; a follow-up commit to remove it is a reasonable next action but is not bundled here — this commit is docs-only.

---

## D-019 — Functional parity rule for reference ports (Constraint C)

Date: 2026-04-25
Status: Accepted

**Context:** Session 5 shipped a productivity calculator at `/admin/calculator` that did not match the upstream `agent-launchpad-template/admin.html` original. The port was built against a paraphrased description of the feature (a four-input form: team size, hours/person/week, hourly rate, platform cost) rather than the original (a multi-associate, multi-task workspace with per-row derived values, per-associate totals, grand totals, ROI, info modals, and CSV export). The result was major functional drift — the new calculator was a different feature wearing the same name. The fix session rebuilt the calculator to match the original; this ADR codifies the rule that prevents the failure mode.

**Decision:** Adopt **Constraint C — Functional parity with originals**. When a feature is being ported from an upstream reference, read the original first and replicate field-for-field, formula-for-formula, interaction-for-interaction. Visual style follows Constraint B (shadcn defaults). Behavior follows the originals exactly unless an explicit exception is documented in this log.

The full rule, including how to apply it on a per-session basis, is recorded in `CLAUDE.md` under the "Reference Ports (Constraint C)" section. This entry is the authoritative record of why the rule exists.

**Reasoning:** Paraphrased descriptions of UX leak content. The reference is the source of truth for behavior; even careful paraphrases of multi-component, formula-driven features tend to omit fields, smooth over edge cases, or "improve" interactions. The originals were authored, tested, and shipped with intent — replicating them faithfully is cheaper than reinventing them, and produces a port a forker can recognize as "the same feature, in the new stack."

The corollary is that visual style is the only axis where deviation is encouraged: the originals are styled with project-specific tokens that this template does not aspire to inherit. Constraint B already governs that axis. Constraint C governs the behavioral axis.

**Alternatives considered:**

- *Status quo (no rule).* Rejected — the failure mode just produced a fix session worth of rework; without a rule, the next port will repeat the failure.
- *"Read the original when convenient" as a soft norm.* Rejected — soft norms are rounded down to zero under deadline pressure. The rule needs to be a hard precondition: a session that ports begins with a verbatim read of the source, and the plan names the source files.
- *Port the original verbatim including styling.* Rejected — Constraint B already exists for good reason; the brand and theme of the upstream template are explicitly out of scope for this project.

**Consequences:**

- Every future reference port (this project draws from `../agent-launchpad-template/`) begins with a verbatim read of the source. The plan presented to the user names the specific source files and line ranges that informed it.
- Plans for reference ports must enumerate the formulas, inputs, derived values, storage keys, CSV columns, and modal copy from the original — not paraphrase them.
- Deviations from the original's behavior must be documented as exceptions in this log, with the reason. The Session 5 fix bundles two such exceptions: (a) no password gate (this project uses middleware-based RBAC; the original's `loginOverlay` + `sessionStorage admin_authenticated` pattern is replaced), and (b) the "Create Report" button is wired to a real CSV download rather than the original's `alert('Report export functionality coming soon!')` placeholder. The Session 6 metrics rebuild extends exception (b) to the two additional "Create Report" buttons in the original (Top Users footer, line 1022; Clicks per Agent footer, line 1110) — both wired to CSV downloads (`top_users_<period>_<mode>.csv`, `clicks_per_agent_<period>_<mode>.csv`) under the same rationale.
- The Session 5 fix calculator rebuild is the first port shipped under Constraint C and serves as the reference for how subsequent ports are scoped, planned, and verified.
- Future sessions that port functionality without a verbatim source read are rejected at plan-review time, regardless of how confident the description sounds.

---

## D-020 — Adoption metrics page is paraphrased; Session 6 rebuild required under Constraint C

Date: 2026-04-25
Status: Accepted

**Context:** The audit conducted during the Session 5 fix (the same fix that established Constraint C in D-019) revealed that `components/admin/adoption-metrics.tsx` was built against a paraphrased description of the original admin.html metrics surface, rather than against the original verbatim. The paraphrased view covers roughly 15% of the source's functionality: it shows top-5 agents by all-time click count and a 7-day daily bucket of clicks. The source (`agent-launchpad-template/admin.html` lines ~925–1112) provides far more — Active Users and Total Interactions metric cards with trend pills, a Top Users table with rank badges, week/month/year time-period selectors throughout, clickable user and agent names that open detail modals showing per-period interaction history, and a bar chart of activity over time with gradient fills. The placeholder also lacks a Create Report button. This is the same failure mode that produced the broken 4-input productivity calculator addressed in the Session 5 fix.

**Decision:** Commit the paraphrased adoption-metrics view as a placeholder (the BACKFILL commit immediately preceding this entry). Rebuild it in Session 6 against the original verbatim under Constraint C. Preserve `lib/analytics/events.ts` (the data sink is correctly factored — committed in `6375d76`, shaped close to the eventual Phase 2 `analytics_events` schema per D-010) and the localStorage-disclosure intro paragraph in `app/(app)/admin/metrics/page.tsx` (it accurately discloses the Phase 1 limitation and was written to survive the rebuild). Replace everything else inside `components/admin/adoption-metrics.tsx`.

**Reasoning:** Same failure mode as the calculator, same remedy. Constraint C (D-019) exists precisely to prevent this drift, and the rebuild pattern is now established. Making D-020 explicit ahead of Session 6 — rather than folding the metrics rebuild into D-019 — gives Session 6 a self-contained scope statement it can reference at plan-review time without re-deriving what's in scope. It also creates a clear precedent for how future paraphrase debt gets recorded: one ADR per affected surface, scoped to that surface, with explicit lists of what survives and what gets replaced.

**Alternatives considered:**

- *Don't commit the paraphrased version; rebuild now.* Rejected — Session 6 is its own focused effort, and the metrics page deserves the same care the calculator received (audit, plan, rebuild). Bundling the rebuild into the Session 5 fix would conflate two reference ports and make both harder to review.
- *Delete `adoption-metrics.tsx` from the working tree and ship the route with a "coming soon" placeholder.* Rejected — the paraphrased version is at least functional against real localStorage events and serves a useful purpose for forkers exploring the template. Holding the tree empty until Session 6 trades a small amount of present utility for nothing in return.
- *Fold this into D-019 as a second example.* Rejected — D-019 is a process ADR (the rule itself); D-020 is a scope ADR (the specific surface that owes the rule its remediation). Mixing them would dilute D-019's role as the canonical statement of Constraint C.

**Consequences:**

- Session 6 rebuilds `components/admin/adoption-metrics.tsx` field-for-field against `agent-launchpad-template/admin.html` lines ~925–1112, in accordance with Constraint C. The Session 6 plan-review must enumerate the original's fields, tables, modals, time-period selectors, and chart contents, and present them to the user before any code is written — exactly as the Session 5 fix did for the calculator.
- `lib/analytics/events.ts` is preserved unchanged across the rebuild. If Session 6 needs to extend the event shape (e.g., to support per-user interaction history for the user detail modal), the changes go there, not in a parallel data layer. D-010's Phase 2 plan still applies.
- The intro paragraph in `app/(app)/admin/metrics/page.tsx` (the localStorage disclosure referencing D-010) is preserved across the rebuild.
- The description string for the "Adoption Metrics" card on the admin landing page (`app/(app)/admin/page.tsx`) is currently aligned with the paraphrased view. After the Session 6 rebuild it should be updated to match the rebuilt surface; bundle that update into the Session 6 fix commit, not as a separate commit.
- D-019 and D-020 together establish a pattern: every reference port that ships paraphrased gets its own scoped ADR documenting the debt, alongside the BACKFILL commit that lands the paraphrased version. Future ports caught at audit time follow this same structure.

---

## D-021 — Demo-data toggle on adoption metrics page completes the original's intended real-data path

Date: 2026-04-26
Status: Accepted

**Context:** The original `agent-launchpad-template/admin.html` was architected to support both sample data and a live analytics integration via an Apps Script backend (`APPS_SCRIPT_URL`, `isApiConnected`, `loadMetrics` / `loadTopUsers` / `loadClicksByAgent` / `loadUserDetails` / `loadAgentDetails`). The integration was never completed — `isApiConnected` is hardcoded `false` at line 1308, and every `loadXxx` API function falls through to its `updateXxx` sample-data sibling on `if (!isApiConnected)`. In effect, the original always renders sample data, but not because sample-data-only was the design intent; it's an artifact of an incomplete integration.

This project, in contrast, has a real analytics data path: `lib/analytics/events.ts` writes `AgentClickEvent`s to localStorage on every external-agent click (D-010). That data is real, present, and matches the shape the original's API path was designed to consume.

**Decision:** Implement the real-data path the original was architected for, using our existing localStorage analytics events (D-010) as the real-data source. Sample data remains available as a demo mode. The Session 6 adoption metrics rebuild ships with a single user-visible toggle that switches between the two sources.

**Reasoning:** This is not a Constraint C deviation. It is the completion of the original's stated architecture, adapted to this project's data path. Constraint C requires field-for-field parity of behavior; the original's behavior includes a real-data mode that simply was never wired. Wiring it honors the original's intent more faithfully than copying the unfinished state. The toggle gives forkers both surfaces — a demo mode that matches the original's visible behavior verbatim, and a real-data mode that actually exercises their localStorage events.

**Alternatives considered:**

- *Sample-data only.* Rejected — wastes the project's real localStorage events, and replicates the original's incomplete state rather than its design intent.
- *Real-data only.* Rejected — leaves no demo experience for forkers exploring the template; new clones would land on an empty dashboard.
- *Side-by-side display (both modes simultaneously).* Considered briefly during the Session 6 audit; rejected — doubles the complexity for marginal benefit, and visually competes with itself when both have data.

**Consequences:**

- The adoption metrics page renders a single toggle (sample vs. real) at the top of its content. Mode-status copy near the toggle is unambiguous so a forker can never misread which data is which: sample mode says "Showing sample data for demonstration." (adapted from the original's `dataSourceText`), real mode says something like "Showing your agent click events from this browser's localStorage."
- The localStorage-disclosure intro paragraph at the route page level (`app/(app)/admin/metrics/page.tsx`, preserved per D-020) and the inline mode-status copy serve different purposes: the page-level paragraph documents the Phase 1 limitation of localStorage-only events; the inline mode-status documents which data source is currently displayed. Both stay.
- Real-mode bucketing semantics mirror sample-data bucketing: week / month / year selectors filter on event timestamps from `lib/analytics/events.ts`. The bucketing helpers live alongside the metrics components; the data sink itself is unchanged per D-020.
- This is the only sanctioned Constraint C exception for the Session 6 rebuild — and the framing in this entry makes it not strictly an exception, but a completion. All other deviations from the original's behavior require a separate ADR.

---

## D-022 — Defer claude-templates sync-back past Phase 2

Date: 2026-04-27
Status: Accepted

**Context:** D-014 and D-015 stated that the sync-back from this project's lessons to the portable `claude-templates` library should happen before Phase 2 begins. `PHASE_0_SYNCBACK_TODO.md` plus Constraint C (D-019), the commit-consistency rule, and the session-close triple-check protocol — all developed across Sessions 4–7 — would target that sync. Phase 2 (native agent runtime) is now the next priority over the sync.

**Decision:** Proceed with Phase 2 first; defer the sync-back to a dedicated session after Phase 2 ships.

**Reasoning:** Project momentum is on Phase 2; native agents are the headline feature that makes the project demonstrable. Sync work, while genuinely valuable, can be done after Phase 2 without blocking any Phase 2 needs. Trade-off accepted: the templates library lags this project by Phase 2's worth of lessons; the next project using the templates inherits pre-Phase-2 patterns until the sync session lands.

**Alternatives considered:**

- *Sync first.* Rejected — Phase 2 momentum is the limiting resource right now, and pausing for an internal-tooling task to satisfy the prior ADRs' stated timing trades shippable feature work for housekeeping.
- *Minimum viable sync (the most-painful gaps only).* Rejected — chose to fully defer rather than half-do. A partial sync leaves an unclear "is this synced?" state that future sessions would have to re-audit, and amortizes the audit cost twice.
- *Silent deferral (no ADR; just slip the timing).* Rejected — D-014 and D-015 made the timing commitment explicit, and the decision log is the right place to be honest about backing off it. Silent slippage erodes the value of the timing commitments those ADRs make in the first place.

**Consequences:**

- `PHASE_0_SYNCBACK_TODO.md` remains as a tracked open item. It is not closed by this ADR.
- After Phase 2 closes, schedule a dedicated sync session that addresses both `PHASE_0_SYNCBACK_TODO.md` items AND the Constraint C / commit-consistency / session-close protocol additions developed during Sessions 4–7.
- The sync session should target both `claude-templates/skills/*` and `claude-templates/CLAUDE.template.md`.
- D-014's and D-015's stated "before Phase 2" timing is amended by this ADR to "in a dedicated session after Phase 2 ships." The sync still happens; only the phase-relative timing slips.

---

## D-023 — Native agent runtime architecture (Phase 2 foundations)

Date: 2026-04-27
Status: Accepted

**Context:** Phase 2 begins; native agents need a runtime. Decisions about streaming, route handler vs. server action, cost tracking, rate limiting, and prompt-injection defense were locked in by the project owner before Session 8a. This ADR records them as a bundle so reviewers can see the architectural shape of the native agent runtime in one place rather than reconstructing it from individual commits.

**Decision:** Bundled commitments for the native-agent runtime, all locked in for Session 8a:

- **Streaming responses.** Anthropic SDK streaming via Server-Sent Events (SSE) compatible HTTP response. No non-streaming code path.
- **Route handler, not server action.** Implementation lives at `app/api/chat/route.ts`. Route handlers handle streaming bodies more cleanly than server actions and give us a stable HTTP contract that smoke tests (`curl`) can hit directly.
- **Anthropic SDK on the server.** `@anthropic-ai/sdk`. The API key lives only in `ANTHROPIC_API_KEY` (server-only, never `NEXT_PUBLIC_`) per D-008. Client components never call Anthropic.
- **Cost tracking on every call.** Every Anthropic call writes a row to `usage_events` capturing `tokens_in`, `tokens_out`, `model`, `user_id`, `agent_id`, `conversation_id`, and `created_at`. Non-optional per the CLAUDE.md "AI Integration Rules" non-negotiables.
- **Per-user rate limiting.** Phase 2 starts with a simple per-user limit (~20 messages/minute). Implementation can be in-memory or Supabase-backed; Redis / proper distributed limiting comes later when scale warrants. Rate limiting is non-optional per the CLAUDE.md security non-negotiables.
- **Prompt-injection defense, two-layer.** (a) Every native agent's stored `system_prompt` is wrapped at request time with a standard preamble that tells the model user content is data, not instructions, and that it must not reveal the system prompt. (b) User input is validated server-side: max length (e.g., 10,000 chars), Zod-typed, and structurally delimited inside the message sent to the model.
- **Per-agent model.** For Session 8a, the model id is hardcoded per agent in `agents.model` (the column already exists in the 0001 schema). Multi-provider abstraction is deferred per PROJECT_OUTLINE.md Phase 6.

**Reasoning:** Streaming is the modern UX expectation for chat — deferring it to Phase 7+ would force a rewrite when the chat UI lands in 8b. Route handlers are a more natural home for streaming responses than server actions; they also give 8a a `curl`-testable surface so the runtime can be smoke-tested without a UI. Cost tracking from day one is a CLAUDE.md non-negotiable, and the cheapest moment to wire it is when the very first Anthropic call ships. Rate limiting prevents both abuse and accidental cost spikes during demos and pilots; absence of a rate limit on a route that calls a paid API is irresponsible. Prompt-injection defense is non-optional given the legal-domain context — attorney work product is the worst possible substrate for a leakable system prompt or a tool-use exfiltration. The bundled-commitments framing matches the pattern D-020 and D-021 established for Session 6.

**Alternatives considered:**

- *Server actions for the chat endpoint.* Rejected — server actions support streaming via `useActionState`-style returns but the contract is less standard than a route handler with a streaming `Response`, and they're harder to smoke-test from `curl`. Route handlers win for a runtime that needs an HTTP contract.
- *Non-streaming responses.* Rejected — UX regression versus expectations set by every modern chat product, and would force rework in 8b.
- *Defer cost tracking.* Rejected — CLAUDE.md AI Integration Rules call out "Cost tracking from day one of native agents" as non-optional.
- *No rate limit for Phase 2 foundations.* Rejected — irresponsible on a route that calls a paid API. Even a coarse limit beats no limit.
- *Multi-provider abstraction in 8a.* Rejected — premature. PROJECT_OUTLINE.md slots model abstraction in Phase 6, after the runtime has settled. Building the abstraction before having a single working provider tends to bake in the wrong seams.
- *Tool use / function calling in 8a.* Rejected — out of scope per the Session 8a brief. The CLAUDE.md AI Integration Rules already require explicit user confirmation on any tool-triggered action; introducing that surface alongside the runtime foundations would conflate two complex problems.

**Consequences:**

- 8a creates the foundations: schema (`conversations`, `messages`, `usage_events` with full RLS), `lib/anthropic/` helpers (client wrapper, streaming, cost calc, prompt-injection preamble), per-user rate limiter, and the `app/api/chat/route.ts` handler. No UI lands in 8a — chat UI is 8b. Converting an existing Commercial agent to native is 8c.
- The chat route uses the user-scoped Supabase server client (not service role) so that RLS remains the last line of defense per D-009. The server still re-validates the user's department access against the agent's `department_id` before any Anthropic call.
- `agents.system_prompt` becomes the stored prompt; the runtime wraps it with the prompt-injection preamble at request time. No DB column changes are required to the existing `agents` table — 0001 already provisions `system_prompt` and `model` columns and the `agents_native_requires_prompt` check constraint.
- Cost-per-token rates live in `lib/anthropic/pricing.ts` as a hardcoded table keyed on model id. Updating rates is a code change. Multi-provider normalized cost (Phase 6) replaces this with a per-provider rate registry.
- Rate limiter, route handler, and SSE response shape are the surfaces 8b's chat UI will consume. 8b should not need to change the route handler's contract; it only consumes the existing SSE event shape.
- A minimal seeded test native agent is required so 8a's `curl` smoke test can run end-to-end. That seed (one row, minimal system prompt) is in scope for 8a; 8c will replace it by promoting one of the six existing Commercial external agents to native.

---

## D-024 — Consolidate to a single Supabase project (retire dev project)

Date: 2026-04-28
Status: Accepted

**Context:** The project initially set up two Supabase projects — a dev project (ref `ebhhqndkitgiwunrgjyb`, named `legal-department-launchpad-template`) for local development, and a prod project (ref `knlnchvfjxchpbkuwtpp`, named `legal-launchpad-prod`, now renamed `legal-department-launchpad-template`) wired up to Vercel. SETUP.md 4c documents single-project as the Phase 0/1 default and a separate prod project as optional isolation. The two-project setup happened by accident rather than by design, and during Session 8b's smoke test the seed data, migrations, and user provisioning had drifted between the two — surfacing as friction the project's solo-developer scale does not justify.

**Decision:** Retire the dev project. Local development and Vercel both point at the prod project (`knlnchvfjxchpbkuwtpp`). The single-tenant deployment now uses one Supabase project across all environments.

**Reasoning:** For a solo demo at Phase 2 scale, the operational overhead of maintaining two synchronized projects exceeds the "test against real data" risk of using one. SETUP.md 4c already documents single-project as the default; this ADR aligns actual practice with documented default rather than introducing a new pattern.

**Alternatives considered:**

- *Keep two projects, sync via Supabase CLI.* Rejected — tooling overhead for solo development is not justified at Phase 2 scale, and the CLI sync surface is itself a class of bugs we'd be inheriting to solve a problem we don't have.
- *Keep two projects, document the sync gotchas in SETUP.md.* Rejected — adds documentation complexity rather than removing the underlying complexity. Future forkers reading SETUP.md inherit the gotchas regardless of whether they want a two-project setup.

**Consequences:**

- Local dev now writes to the same database as Vercel deploys. `.env.local` was updated to point at the prod project (gitignored, not committed); the dev project's keys are no longer in active use anywhere in this repo.
- SETUP.md 4c's "use a separate Supabase project for production if you want isolation" sentence remains valid as advice for future forkers; this project's owner has chosen single-project explicitly and that choice is recorded here.
- `PHASE_0_SYNCBACK_TODO.md` and any future templates sync session should reflect that the template can document either path; neither is the canonical right answer.
- If a future need for isolation emerges (real users, real data sensitivity, multi-environment QA), provision a fresh prod project and re-promote at that time. The dev project ref `ebhhqndkitgiwunrgjyb` should not be reused — re-provision rather than resurrect.
- Post-consolidation cleanup (2026-04-28): the retired dev project was deleted from Supabase, and the surviving prod project was renamed `legal-launchpad-prod` → `legal-department-launchpad-template` so the Supabase project name matches the GitHub repo name (D-007). Project ref `knlnchvfjxchpbkuwtpp` is unchanged — Supabase refs are immutable.

---

## D-025 — Expand Phase 2 scope: agents are user-owned, configurable, and extensible

Date: 2026-04-28
Status: Accepted

**Context:** Phase 2 was originally scoped as "native agent runtime" — Sessions 8a (foundations) and 8b (chat UI) landed cleanly and validated end-to-end against a single Test Smoke Agent. Session 8c was originally scoped to promote one of the six Commercial external agents to native, with a hardcoded system prompt and a single migration path from external card to native chat. During Session 8c the project owner surfaced a substantially larger product vision: native agents should be user-owned, user-configurable, extensible workspaces with attached references, configurable tools, multi-format output (markdown + Word in v1), and a forward path to multi-vendor model support. The architecture document at `docs/AGENT_ARCHITECTURE.md` is the design specification produced in 8c and is the spec subsequent Phase 2 sessions implement.

**Decision:** Accept the scope expansion. Phase 2 becomes a multi-session arc that implements `docs/AGENT_ARCHITECTURE.md` in dependency order. Session 8c lands the architecture document, this ADR, the PROJECT_OUTLINE.md reorganization, and the changelog entry — no code, no schema changes, no migrations land in 8c. Subsequent sessions implement, sequenced when picked up rather than pre-numbered.

**Reasoning:** The original Phase 2 framing produced a real working surface (Sessions 8a/8b smoke-tested end-to-end through Session 8b's verification against the live runtime) and validated that the runtime substrate is sound. The scope expansion reflects requirements surfaced through detailed design conversation: the product is genuinely more useful as a configurable workspace than as a launchpad with a static native chat tab. Doing the architecture work first means subsequent sessions have a target spec to implement against, avoiding the failure mode where individual sessions make ad-hoc architectural decisions that compound into rework. The architecture document is deliberately long and prose-heavy because every Phase 2 session after 8c will read it as their spec; that one-time investment in writing a real design document amortizes across many implementation sessions.

**Alternatives considered:**

- *Promote one Commercial agent to native with a hardcoded prompt as originally planned, defer architecture work.* Rejected — the architectural decisions surfaced during 8c (user ownership model, attached references, prompt caching as required-from-day-one architecture, multi-vendor structuring, the per-message-upload vs configurable-tool distinction) cannot be made well under code-shipping pressure in a session whose deliverable is a single agent conversion. Forcing those decisions to land alongside code would either skip the design rigor or stall the code; doing them as a documentation-only session lets each get the attention it needs.
- *Implement the full architecture in one mega-session.* Rejected — the resulting work is too large for a single session, has too many failure modes (each subsystem can drag the whole session if it hits a snag), and violates the established session-discipline that has worked for the project to date (one logical change per session, each session ends in a clean push). The architecture phasing list in the document is the concrete refutation of this alternative: 10 dependency-ordered work items, each session-sized.
- *Write the architecture inline in PROJECT_OUTLINE.md, no separate document.* Rejected — PROJECT_OUTLINE.md is the roadmap, intentionally compact, and a 400-line architecture spec inside it would unbalance the document. The separate `docs/AGENT_ARCHITECTURE.md` is the right home; PROJECT_OUTLINE.md gets the Phase 2 reorganization that points at the architecture doc as the spec.

**Consequences:**

- `docs/AGENT_ARCHITECTURE.md` is the spec subsequent Phase 2 sessions implement. Treat it as a living document — refinements during implementation update the doc, not just the code, so the spec and the codebase stay aligned.
- `PROJECT_OUTLINE.md` Phase 2 is reorganized in this session to mirror the architecture's implementation phasing list. The original "Phase 2 — Native Agent Runtime (1–2 weeks)" framing is replaced with a multi-session arc shape. Phase 5 (Agent Admin UI) and Phase 6 (Model Abstraction) are also touched: Phase 5 is reframed because user-level agent CRUD now lands in Phase 2 and Phase 5 becomes the residual admin-only surface; Phase 6 is reframed because the directory structuring and dispatcher land in Phase 2's first work item, so Phase 6 is "ship sibling adapters" against an existing structure.
- Test Smoke Agent retirement is part of the implementation phasing (item 4 in the architecture's list), not Session 8c. The deferred 8a → 8c retirement note in D-023 is honored, just by a different session than originally planned.
- The deferred-to-roadmap list at the end of `docs/AGENT_ARCHITECTURE.md` is the source of truth for what Phase 2 does NOT include. Items there have explicit re-evaluation triggers; no item is "deferred forever," only "deferred until X surfaces."
- D-010's analytics-promotion commitment (localStorage → Supabase, originally a Phase 2 work item) survives this scope expansion. It is deliberately excluded from the architecture doc's phasing list because it is independent of agent runtime architecture, but it remains a Phase 2 commitment tracked in PROJECT_OUTLINE.md.
- Prompt caching is locked in as required architecture (not optimization) from the first user-created native agent. `usage_events` will gain `cache_creation_tokens` and `cache_read_tokens` columns when the relevant migration session lands; cost analytics that ignored the cache layer would systematically misreport spend on subsequent turns of every conversation.

---

## D-026 — Rename to legalOS

Date: 2026-04-30
Status: Accepted (supersedes the slug commitment in D-007)

**Context:** The project has carried "Legal Department Launchpad Template" / `legal-department-launchpad-template` as its name since D-007 (2026-04-21). Through Sessions 8a–8l the product surface has grown well past "launchpad" — native chat with prompt caching, configurable per-agent tools (web search), attached references with text extraction, per-message Word export, soft-delete with 30-day undo, agent CRUD, an 8-department launchpad with role-based access, productivity-calculator and adoption-metrics admin surfaces. The "launchpad" framing reads as one entry point to other tools; the actual product is the operating layer in-house legal teams work inside.

**Decision:** Rename to **legalOS**. Display name "legalOS" (camelCase, lowercase 'l'); slug / package name / repo name "legalos" (all lowercase). Browser tab title pattern: `<page> · legalOS`. Header on all surfaces: `legalOS` alone, no tagline.

**Reasoning:** The new framing — "an operating system for legal departments" — is a more accurate description of what's been built. "Launchpad" describes a single capability; "operating system" describes the substrate. Choosing the substrate framing now sets the right reader expectation for the docs, the README, and the marketing surface that this project will eventually need.

The casing choice (camelCase legalOS / lowercase legalos) follows the loose convention of `nodeJS`, `iOS`, `macOS` — domain-name and command-line cases use lowercase, brand cases use the camel form. Consistent with how those names are written in user-visible chrome (tab title, headers) versus identifiers (package names, URLs, slugs).

**Alternatives considered:**

- *Stay with "Legal Department Launchpad Template."* Rejected — accurate when the project was a starter scaffold; misleading after the substrate-shaped capabilities of Phase 2 landed.
- *"Legal OS"* (with space, two words). Rejected — splits the brand name visually and tokenizes weirdly in command-line / URL contexts. The closed-up `legalOS` form reads as one identifier.
- *"LegalOS"* (capital L). Rejected — looks like a misspelling of a product name where the lowercase prefix is the recognizable hook (cf. `iPhone`, `iPad`, `nodeJS`).
- *"Atrium," "Aegis," "Keystone," "Chambers," "Docket"* (codenames considered in D-007). Rejected for the same reason as in D-007 — branded names are opaque without a tagline; descriptive names earn faster recognition. legalOS is a hybrid: descriptive (`legal`) plus categorical (`OS`).

**Consequences:**

- Display copy on every UI surface flips to "legalOS." `siteConfig.siteTitle` and the layout's metadata title template carry the brand text.
- Browser tab title flips to `legalOS` (default) and `<page> · legalOS` (per-page) via `app/layout.tsx`'s `metadata.title.template`.
- `package.json` `name` field flips to `legalos`.
- README, PROJECT_OUTLINE, CLAUDE.md, DECISION_LOG, SETUP, docs/AGENT_ARCHITECTURE all reframed to legalOS identity. Existing decision-log entries D-001–D-025 stay verbatim per the immutable-history rule; this entry (D-026) is the canonical rename record.
- Migration and seed file headers (`supabase/migrations/0001_*.sql` through `0012_*.sql`, `supabase/seed/0003_*.sql`) preserve their original `legal-department-launchpad-template` headers as historical run artifacts — they document what the project was called when each migration was authored and applied. Future migrations use the new name.
- D-007's slug commitment (`legal-department-launchpad-template`) is superseded by this entry. The GitHub repo, Vercel project, and Supabase project (ref `knlnchvfjxchpbkuwtpp`, immutable per D-024) all rename to `legalos`. GitHub keeps a redirect from the old URL.
- White-labeling per-deployment (an organization-level `brand_name` column overriding `siteConfig.siteTitle`) is deferred — not in scope here. Forks today inherit the legalOS branding by default; the option to override per-tenant lands when multi-tenancy actually ships.

## D-029 — Department restructure: merge GRRA into Public Sector, add General Tools

Date: 2026-05-02
Status: Accepted

**Context:** Sessions 9a–9e implement a UI/UX overhaul ("Aperture"). The Aperture design's department model has Public Sector absorb the scope previously carved off into Government Relations & Regulatory Affairs (GRRA), and adds a new General Tools department as the home for utility / general-purpose agents that don't belong to a specific practice area. Session 9b is the data-layer half of that restructure — schema/UI alignment in 9c–9e depends on the database already being in the new shape. The DB pre-9b: 8 departments in order Commercial, Public Sector, GRRA, M&A, Privacy, Product, Compliance, Operations. The DB post-9b: 8 departments in order Commercial, Public Sector, M&A, Privacy, Product, Compliance, Operations, General Tools.

**Decision:**

- **Merge GRRA into Public Sector.** Hard-delete the GRRA department row. Public Sector's description absorbs GRRA's scope: `"Government relations, regulatory affairs, public-sector contracts, and policy advocacy."`. **Delete (do not move) GRRA's only agent — the Blank Agent template `blank-agent-grra` seeded by 0004 — because Public Sector already has its own Blank Agent template (`blank-agent-public-sector`); moving GRRA's would have created two functionally identical templates in the same department, defeating the merge.** Pre-flight inspection (run before applying the migration) is the verification that GRRA contains exactly one row with the expected slug; the migration itself is plain SQL and trusts that pre-flight rather than re-checking with PL/pgSQL guards.
- **Add General Tools.** Insert at sort_order 8 with description `"general purpose agentic tools"` (lowercase, no period — user-specified exact string, deliberate divergence from the sentence-case + period convention used by the other seven department descriptions). Slug `general-tools`. Blank Agent template seeded for it like every other department. Existing org_admin / super_admin users auto-grant dept_admin via the role-based generic clause established in 0012.
- **Hard-delete, not soft-delete.** Even though `departments.is_active` exists, app code does not filter on it (`getAccessibleDepartments`, `getDepartmentIfAccessible`, the RLS policy `departments_read_same_org`) — soft-deleting GRRA would leak it through slug navigation and any inner join on `user_department_roles → departments`. Hard delete is enforced safely by the FK design: `agents.department_id ... on delete restrict` blocks the DELETE until agents are moved out, and `user_department_roles.department_id ... on delete cascade` removes membership rows automatically.
- **Implementation in `supabase/migrations/0013_grra_to_public_sector_and_general_tools.sql`** as plain SQL inside a single `BEGIN; … COMMIT;` transaction — no `do $$ ... end $$` block, no declared variables, no defensive `RAISE EXCEPTION` guards (pre-flight is the verification). Slug-based subqueries (`(select id from departments where slug = 'grra')`) replace ID-into-variable lookups. One-shot prod backfill, not a re-runnable seed; `ON CONFLICT DO NOTHING` is used where it naturally fits (department insert, role grant, Blank Agent insert) but no extra branching for "already-applied" cases.

**Reasoning:**

GRRA's original scope — "lobbying, regulatory monitoring, policy advocacy" — overlaps heavily with Public Sector's existing mandate. The Aperture design treats this as one practice area and folds the GRRA flavor into Public Sector's description. Maintaining a separate GRRA department adds a column to the launchpad without a meaningfully different agent set behind it.

General Tools fills a real gap: utility agents (a generic Blank Agent, a "summarize this" assistant, a translation helper) don't belong to any specific practice area and were previously parked under whichever department happened to be open. Naming the bucket explicitly makes the launchpad's IA honest about where these live.

The lowercase "general purpose agentic tools" description is a user-chosen deviation from the sentence-case + period convention. Captured here so future copy reviews don't flag it as a typo and "fix" it.

**Alternatives considered:**

- *Soft-delete GRRA via `is_active = false`.* Rejected — would leak through slug navigation and inner-join queries because neither app code nor the RLS policy filters on `departments.is_active`. Soft-delete would require app-code and policy changes to be safe; bigger scope than 9b warrants.
- *Move GRRA's scope into Compliance instead of Public Sector.* Rejected — "regulatory monitoring" overlaps with Compliance, but "lobbying" and "policy advocacy" align more with Public Sector's government-facing posture. Public Sector is the closer fit.
- *Keep GRRA, just rename it.* Rejected — the Aperture design is explicit that the 8-department list should not include GRRA. Renaming preserves the column count without addressing the underlying redundancy.
- *Add General Tools as a special category within an existing department (e.g., Commercial).* Rejected — utility agents serve every department, not just one. Putting them under Commercial would re-create the problem of "where do I put a general-purpose agent" with extra steps.

**Consequences:**

- Migration `0013_grra_to_public_sector_and_general_tools.sql` is the prod backfill. The reverse-block at the bottom of the file documents the rollback shape (manual restoration of GRRA + Public Sector description + sort_order shifts), but does not auto-restore agents that were moved from GRRA → Public Sector — those would need a manual decision on whether the Public-Sector copy has since been used.
- Companion files updated: `supabase/seed/0004_blank_agents.sql` (header comment refreshed to list the post-9b 8 departments — the file's `for v_dept in select … from departments` loop is generic and picks up General Tools without code changes) and `config/departments.ts` (data-only mirror of the canonical 8-department list, no runtime consumer).
- Stale current-state references updated in `CLAUDE.md` (Project Overview line listing the eight departments), `SETUP.md` (the manual SQL fallback in 3f, plus the surrounding "all five" prose), `lib/metrics/sample-data.ts` (header comment listing the four departments the invented agents belong to). Historical phase-description content in `PROJECT_OUTLINE.md` (Phase 1 Shipped table; Phase 4 plan) and `docs/AGENT_ARCHITECTURE.md` (the "five starter departments, no AI department" section describing Phase 2's design-time scope) is preserved verbatim per the same rule that preserved migration headers in D-026 — phase descriptions stay as-is, decision-log entries record the changes.
- Migrations 0001–0012 are NOT touched. They remain the historical record of what was applied at the time. Future migrations reference the post-9b state (8 departments without GRRA, with General Tools).
- D-027 (Aperture font choice) and D-028 (Constraint B relaxation for the Aperture visual style) are reserved for the implementation sessions that surface them; they will land out-of-order relative to D-029 because 9b's data work happens before 9c–9e's UI work. The numbering reflects topic ordering, not chronology.

## D-027 — Font reversal: D-022 system-ui → Inter Tight + Geist Mono, self-hosted

Date: 2026-05-02
Status: Accepted (supersedes D-022)

**Context:** Session 8g (D-022) dropped `next/font/google` (Geist + Geist_Mono) and replaced the font tokens with system-ui stacks (`-apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, …` for sans; `ui-monospace, "SF Mono", Menlo, …` for mono). The motivation at the time was avoiding the Google Fonts runtime dependency and matching whatever the user's OS already provided. With Sessions 9a–9e (Aperture UI/UX overhaul) underway, the Aperture design's typography is load-bearing — a 52px hero headline, 10–11px mono caption labels, and a tight-tracking + variable-weight rhythm that depends on Inter Tight specifically. System-ui fonts render meaningfully differently across operating systems (San Francisco on macOS, Segoe UI on Windows, Roboto on Android), and at the design's small sizes the differences become legibility-affecting, not just stylistic.

**Decision:** Reverse D-022. Self-host two fonts via `next/font/local`:

- **Inter Tight** (display + UI surfaces, weights 100–900 via the variable axis). Sourced from `@fontsource-variable/inter-tight` (npm), copied into `app/fonts/inter-tight-variable-latin.woff2` plus the SIL OFL 1.1 LICENSE.
- **Geist Mono** (mono surfaces, same variable-axis approach). Sourced from `@fontsource-variable/geist-mono` (npm), copied into `app/fonts/geist-mono-variable-latin.woff2` plus the SIL OFL 1.1 LICENSE.

Aperture's spec calls for IBM Plex Mono; **Geist Mono is substituted** for three reasons: (a) we don't want IBM-branded font assets in this project, (b) Geist Mono lives in the same humanist-mono neighborhood as Plex (similar x-height and weight rhythm, designed for UI density), and (c) Geist Mono pairs naturally with Inter Tight — both have clean lowercase forms designed for small sizes.

`localFont` declarations in `app/layout.tsx` expose two CSS variables (`--font-display` for Inter Tight, `--font-mono` for Geist Mono). `app/globals.css`'s `@theme inline` block references those variables in `--font-sans`, `--font-mono`, and `--font-heading` with `system-ui, sans-serif` / `ui-monospace, monospace` fallbacks.

**Reasoning:**

The pivot is that the project now has a commissioned design (Aperture, Session 9a) with specific typographic intent. Deferring to system fonts was a Phase-1 speed call when no specific design was in play; with a design in hand, type rendering needs to be consistent across platforms and weights — including the non-standard weight 450 that Inter Tight's variable axis makes available.

Self-hosting via `next/font/local` rather than `next/font/google` keeps the runtime dependency-free (no Google Fonts CDN call), commits the fonts into the repo (version-pinned to whatever was in `@fontsource-variable/*` at copy time), and lets `next/font` apply its automatic metric-overridden fallback (size-adjusted Arial during loading, eliminating layout shift). Variable woff2 files (1 file per family — ~45KB Inter Tight + ~31KB Geist Mono = ~76KB total) cover all weights including 450 from a single asset; static-instance distributions per weight would balloon to 6 + 2 = 8 woff2 files and still wouldn't cover the 450 axis point.

**Alternatives considered:**

- *Use `next/font/google`.* Rejected — re-introduces a runtime dependency on Google Fonts and the privacy / perf concerns that originally motivated D-022.
- *Use IBM Plex Mono as the Aperture spec specifies.* Rejected — we don't want IBM-branded assets in the project. Geist Mono is a near-equivalent visually.
- *Use the `geist` npm package directly.* Rejected — the package wraps `next/font` internally; self-hosting via `next/font/local` is the cleaner pattern matching how Inter Tight is set up.
- *Static-instance distributions per weight.* Rejected — Inter Tight at weight 450 is only available via the variable axis, and static instances inflate the asset count without benefit.

**Consequences:**

- D-022's system-ui font stack is removed from `app/globals.css`. The `@theme inline` font tokens (`--font-sans`, `--font-mono`, `--font-heading`) now resolve through the localFont CSS variables.
- All UI surfaces re-render in Inter Tight (sans / heading / UI) + Geist Mono (mono / code) instead of San Francisco / Segoe UI / Roboto. Existing screens designed against the system-ui stack may look slightly off in Inter Tight (different metrics, different feel) — they get renovated in 9d / 9e or ad-hoc later.
- Both fonts ship with their SIL OFL 1.1 LICENSE files committed alongside the woff2 in `app/fonts/`. License compliance is in-repo, not deferred.
- `@fontsource-variable/inter-tight` and `@fontsource-variable/geist-mono` were installed as dev deps for the file copy and then uninstalled. They are not runtime dependencies. The fonts live in `app/fonts/`, not `node_modules/`.
- Future font tweaks (adding italic axes, swapping families, adjusting feature settings like `ss01` / `cv11` from the Aperture spec) happen by editing `app/layout.tsx`'s `localFont` declarations.

## D-028 — Constraint B relaxed: shadcn primitives for interaction, design tokens for visual

Date: 2026-05-02
Status: Accepted (relaxes Constraint B from D-014)

**Context:** Constraint B (D-014, the Tailwind-v4 + shadcn decision) was: let shadcn defaults drive the visual style. No theme port from the prior `agent-launchpad-template`, no custom palette, just shadcn's neutral OKLCH defaults. The motivation was Phase-1 speed — shipping a working app without spending days picking colors that would change anyway when a real design landed. With Sessions 9a–9e (Aperture UI/UX overhaul) underway, a real design HAS landed, and the discipline shifts.

**Decision:** Relax Constraint B. Replace it with this new constraint:

> **Use shadcn primitives for interaction; override visual styling via Aperture design tokens.**

Concretely:

- **Keep using shadcn for interaction correctness.** Button, Input, Dialog, DropdownMenu, Popover, Sheet, Command, Tooltip, etc. — anything whose value is in interaction logic (focus management, keyboard shortcuts, ARIA, portal handling, click-outside, animation orchestration). These are hard problems that shadcn solved well; don't reimplement.
- **Override visual styling via Aperture tokens.** Don't fight shadcn's CSS variables — rebind them. Session 9c remaps the existing shadcn tokens (`--background`, `--foreground`, `--primary`, `--muted`, etc.) to Aperture roles so existing className references like `bg-background` and `text-muted-foreground` keep working but resolve to the new palette. New tokens that don't have a shadcn analog (`--paper-2`, `--hairline`, `--hairline-strong`, `--card-divider`, `--ink-2`, `--caption`, `--accent-hover`) are added alongside and exposed via `@theme inline` so Tailwind generates first-class utilities.
- **When shadcn's component visual conventions diverge from Aperture**, override at the className / `cn()` layer in the consuming component — not by forking the primitive. If the override grows past a few utility classes, that's a signal to extract a project-level wrapper component.

**Reasoning:**

This is what most teams do once they have a real visual identity. The shadcn-defaults posture is right for the first weeks of a project; it's not right once a designer has shipped a palette, type system, and spacing rhythm. Treating shadcn as an interaction library (not a visual library) gives us interaction correctness for free and visual sovereignty where it matters.

The token-rebinding approach (Session 9c's mechanism) is specifically chosen to avoid component-by-component visual rewrites. By rebinding what `--background`, `--primary`, etc. resolve to, every existing screen visually shifts in one CSS edit — without touching any component or page file. This is the lowest-touch path from "shadcn neutral" to "Aperture warm-paper" and the right shape for a design-system change of this scale.

**Alternatives considered:**

- *Hold Constraint B as-is.* Rejected — wastes the Aperture commission and means the product looks like a generic shadcn starter despite the design work.
- *Fork shadcn primitives and rewrite their visual styling internally.* Rejected — couples us to specific shadcn versions, makes future updates hard, and concentrates visual choices inside primitive code where it's harder to audit. Token rebinding keeps the change reviewable in one CSS file.
- *Adopt a non-shadcn primitive library that ships with Aperture-compatible visuals.* Rejected — we'd lose interaction correctness, accessibility work, and the keyboard / focus behavior shadcn already gets right. The visual is the easier half to override.

**Consequences:**

- Future component work in 9d / 9e renovates UI surfaces by composing shadcn primitives + project tokens, NOT by writing custom React components from scratch. The Aperture department card, for instance, would be a `Card` (shadcn or near-equivalent) styled with `bg-card`, `border-border`, custom radius and shadow utilities, and the `ArrowRight` icon — not a hand-built `<div>` with inline styles.
- The new Aperture tokens (`--paper-2`, `--hairline`, etc.) are available via standard Tailwind utilities (`bg-paper-2`, `border-hairline`, `text-caption`). Component code consumes these the same way it consumes `bg-background` — no special syntax.
- Constraint B from D-014 is no longer load-bearing. References to it in code review, planning, or skill files should be updated to the new constraint above. The two are NOT contradictory in spirit (both prefer "don't reinvent what shadcn does well") — D-028 just sharpens the boundary between interaction and visual.
- Dark mode tokens (the `.dark` block in `app/globals.css`) are deliberately untouched in 9c. Aperture is light-mode only by spec; dark mode retune is a future session.

## D-030 — Chat surface widens to max-w-4xl while prose stays at max-w-3xl

Date: 2026-05-04
Status: Accepted

**Context:** Session 15 ports the Aperture chat surface (`/agents/<id>`) toward spec `docs/design/aperture/chat-aperture-spec.md`. The spec's §1.4 visual reference puts the entire turn — 64px speaker-label gutter + gap + flexible content — inside a single `max-w-3xl` (768px) column. After the initial 15a smoke pass landed the surface at the spec's max-w-4xl-then-3xl arrangement (heading + lists at 4xl, message body at 3xl, with bubble-style user-right / assistant-left layout), user feedback during smoke surfaced two distinct problems: (a) the chat width visibly jittered when the first message overflowed the scroll container and a vertical scrollbar appeared, narrowing the content area and re-centering the inner column; (b) the surface read as narrow at rest, with margins that didn't communicate "this is the work area" the way Claude's own chat surface does. The fixes for (a) and (b) couple: replacing the bubble paradigm with the speaker-gutter pattern from spec §1.4 unifies turn shape and removes the per-bubble width-cap escape hatches that contributed to (a); pulling session 16's turn-layout work forward into 15 lets both fixes ship together rather than landing the diagnosed jitter fix on top of a layout that's about to be replaced anyway.

**Decision:**

- **Outer chat wrapper widens to `max-w-4xl` (896px).** The page `<main>` and the message-list `<ul>` both cap at 4xl, mx-auto centered. This is the "chat surface" width the user sees as the chrome boundary of the conversation.
- **Prose column stays at `max-w-3xl` (768px).** The MarkdownRenderer's outer div applies `max-w-3xl`, and the user-message tinted card matches at `max-w-3xl`. Both speakers' content visually align with the composer (also `max-w-3xl mx-auto`), giving a single consistent prose column for the whole conversation. Legal reading at 14.5–15px stays in the 56–60ch sweet spot per spec §1.
- **64px speaker-label gutter sits between the wrapper and the prose column.** Each turn `<li>` is a flex row: `[64px gutter][gap-4][flex-1 content with max-w-3xl][optional download button]`. The gutter holds mono-caps `YOU` (slate-blue, the only place YOU shows in slate per spec §2.2) or `AGENT` (caption tone). At full 4xl width, the prose left edge sits at gutter-end ≈ 80px from the wrapper's left, exactly aligned with the composer's left edge underneath. The right side of each turn carries ~64px of breathing room where the eventual hover-reveal metadata gutter (spec §2.10) will live in a later session.
- **`scrollbar-gutter: stable`** on the message-list scroll container, applied via a Tailwind v4 `@utility scrollbar-stable` rule in `app/globals.css` (not an arbitrary value at the call site). Reserves the scrollbar track's width in the layout box so the first overflow does not shift centered content leftward.
- **`min-w-0` on the flex-1 content column** in every turn shape. Defeats the `min-width: auto` (= min-content) default that lets unbreakable tokens (long URLs, wide inline code) push past `max-w-3xl`.
- **Sizing fix shipped same session.** `ChatInterface`'s legacy `h-[calc(100vh-4rem)]` is replaced with `min-h-0 flex-1`, and the page `<main>` gains `min-h-0 flex-1 overflow-hidden`, so the chat surface contains its own scroll inside `MessageList`. Without this, the composer falls below the visible fold (~92px on a typical viewport) and the visible width fix would land on top of a still-broken sizing story. The workspace body wrapper at `app/(workspace)/layout.tsx` is unchanged — other workspace routes (departments, agents listings, admin) need its `overflow-auto` behavior.

**Reasoning:**

The user's "just like Claude" requirement is about the felt presence of the chat surface, not just line-length. Claude's own chat sits at a wider chrome with prose constrained tighter inside. The spec's literal max-w-3xl-everywhere reading optimizes line-length but produces a chat surface that reads as narrow at rest, especially on the 1440–1920px viewports the product targets. Splitting the two layers (wrapper at 4xl, prose at 3xl) keeps the legal-reading argument intact while giving the chrome the presence the user is asking for.

The speaker-gutter pattern from spec §1.4 was already going to land in session 16; pulling it forward into 15 avoids shipping a layout (Session 15's `max-w-[80%]` bubbles) that the very next session was going to throw out. The width-jitter bug and the bubble paradigm share root causes — three nested width layers (page main 4xl, message ul 3xl, per-bubble 80% with no min-w-0) all recomputing independently against parents whose effective width changed when a scrollbar appeared. Collapsing to one canonical width per layer (4xl wrapper, 3xl prose, no per-message cap) plus stable scrollbar gutter plus min-w-0 fixes the jitter directly rather than papering over it.

The sizing fix is in scope because shipping a width-correct layout where the input falls below the fold defeats the visible improvement. The two are not separable from a "does this surface feel like a real chat" perspective.

**Alternatives considered:**

- *Implement spec §1.4 as written: max-w-3xl entire turn including gutter.* Rejected — produces the narrow-feel the user explicitly pushed back on. The line-length win is real but the user's lived experience of the surface is the actual requirement.
- *Widen prose to max-w-4xl too.* Rejected — pushes typical lines past 90 characters at 14.5–15px, hurting legal long-read comprehension. The spec's line-length argument is correct; we keep it for prose.
- *Fix only the scrollbar-gutter jitter and defer the speaker-gutter rewrite to session 16.* Rejected — Session 16 was about to replace the entire bubble paradigm. Stabilizing a layout that's getting thrown out costs review/test/QA time on dead-end code. The bubble paradigm also had `max-w-[80%]` per-bubble caps without `min-w-0` — separately a contributor to width jitter. Both fixes belong together.
- *Move the prose constraint (`max-w-3xl`) to a per-message wrapper, not into MarkdownRenderer.* Rejected for now — single consumer, no propagation concern. If a future MarkdownRenderer consumer wants unconstrained prose, the override is a className prop or a sibling renderer at the call site. Revisit if a second consumer appears.
- *Defer the sizing fix (`h-[calc(100vh-4rem)]` → flex sizing) to a separate session.* Rejected — composer below the fold would undercut the visible width win. Pulling it forward keeps the session's deliverable coherent.

**Consequences:**

- Spec §1.4's "max-w-3xl entire turn" reading is a documented deviation, not a misread. Future spec readers should trust this entry over a literal reading of §1.4. The §2.2 (YOU label slate-blue), §2.3 (assistant prose type ramp), and §2.7 (composer max-w-3xl) parts of the spec are followed exactly.
- The right side of each turn carries ~64px of empty space at full 4xl width. This is intentional headroom for spec §2.10's hover-reveal metadata gutter. When that lands, no width math changes — the existing layout already reserves the space.
- `MarkdownRenderer`'s outer div now applies `max-w-3xl`. Currently a single consumer (assistant message bubble); no propagation surface.
- The chat surface is the only workspace route with self-contained scroll. Departments, agents listings, admin, and the chat-input-disabled archived state continue to use the workspace body wrapper's `overflow-auto`. This split is intentional — chat needs a fixed input at the bottom, the others don't.
- Spec §2.6 streaming caret, §2.5 tool-trace state machine, §2.4 superscript-and-footnote citations, and §2.10 hover-reveal metadata gutter remain deferred. Session 18 (citations renovation) and session 19 (streaming/tool-trace) pick them up.
- `gap-7` (28px) between turns matches the visual reference's `.col { gap: 28px }`, replacing Session 15a's `gap-4` (16px). If the rhythm reads too airy in long sessions, tighten to `gap-6` in a follow-up — not blocking sign-off.

---

## D-031 — Citation marker stability + trace card grouping (Session 18)

Date: 2026-05-04
Status: Accepted

**Context:** Session 18 lands tool traces and citations end-to-end — streaming pipeline (Step B), visual polish (Step C), and a same-session addendum that reshaped two UX patterns based on live-streaming smoke. Two design choices made this session deserve their own ADR rather than being buried in the CHANGELOG, because both shape downstream constraints (renderer plugin surface, tool-call schema migration, regen / edit flows) and a future reader of the code will rightly ask "why this shape and not the obvious alternative."

**Decision:**

- **Citation markers persist as stable per-source IDs in HTML `<sup>` tags inside the message body.** Each unique citation URL within a single message gets a `src_<12-char-hex>` id generated server-side at first encounter (deduped by URL within the message; the same URL cited three times in a sentence produces one source record but the within-drain dedup also collapses repeated pills to one). The id is embedded as `<sup data-source-id="src_xxx"></sup>` directly inside the persisted `messages.content` body. The numeric superscript label the user sees (`[1]`, `[2]`, …) is computed at render time as `sources.findIndex(s => s.id === markerId) + 1`, never stored. The rendering pipeline is `react-markdown` → `remark-gfm` → `rehype-raw` (promotes raw HTML in markdown into hast) → `rehype-sanitize` with a schema that whitelists `sup[data-source-id]` (bare-string allow, not a tuple — see Step-C-addendum smoke for the silent-strip bug the tuple form caused) → `react-markdown` component override that routes the `sup` element to a `<CitationMarker />` chip. The marker syntax uses explicit open+close (`<sup ...></sup>`), not self-closing (`<sup ... />`) — HTML5 ignores the trailing `/` on non-void elements, leaving an unclosed `<sup>` that wraps every subsequent token (text, lists, even later sup tags) as nested children, which was the load-bearing bug the Step C smoke caught. A legacy normalizer in `markdown-renderer.tsx` rewrites the old self-closing form at render time so messages persisted before the fix display correctly without a backfill migration.

- **Trace card grouping happens at render time only.** The DB schema (`messages.tool_calls` JSONB, added in migration 0014) stores one record per Anthropic `tool_use_id` — every individual call carries its own `{ id, name, input, output, status, started_at, finished_at?, position, error? }` entry. The grouping into a single visual card is computed by `buildBlocks()` in `components/chat/message-bubble.tsx`: after sorting tool calls by their captured `position` offset, the function walks the sorted list and buckets adjacent same-name calls into a `tool_trace_group` block when the body slice between the previous call's position and the next call's position trims to empty (i.e. no actual prose between them). A search → sentence of prose → another search produces two cards; four parallel searches with no prose between them produce one grouped card with header `Web search · Searched · 4 queries`. Singleton groups render exactly as ungrouped Step C did — no count segment, single Query + Result expanded panel.

**Reasoning:**

*Citation marker stability.* Stable IDs survive the surface area of operations that would invalidate index-based markers: edits to the body, regenerations that change sentence ordering, future merge / split / branch operations, DB roundtrip across migrations. Rendering numbers from `findIndex` keeps the visible label correct even if sources are reordered after persistence (e.g. a future "consolidate duplicate sources" pass). HTML `<sup>` is semantic, standards-track, and survives any markdown processor or sanitizer with a one-line allowlist — it requires no remark/rehype plugin we'd need to ship and maintain. Plugin surfaces rot: a custom `[^src_xxx]` syntax would lock us to a remark plugin's API across upgrades, where `<sup>` is HTML and continues to work for as long as HTML continues to exist. The cost of the choice is that the persisted body is no longer "pure markdown" — it carries inline HTML — but we already render through `rehype-raw` for other reasons and the security posture is preserved by the explicit attribute whitelist.

*Trace card grouping at render time.* The persisted shape is the truth — every Anthropic `tool_use_id` is its own record, with its own input, output, timing, and source attribution. Grouping is a presentation concern: how the user perceives parallel work. Rendering grouping from the same data preserves position-in-prose semantics (Decision A from the Step B prompt — tool traces slot into the body at the position where the model invoked them), keeps schema changes to zero, and means a future product decision to ungroup, regroup, or change adjacency rules requires no migration and no historical-data risk. The cost is that the grouping logic lives in two places — the `buildBlocks` walker and the `ToolTraceCard` multi-call branch — but both are colocated in `components/chat/` and fully tested by the smoke flow. The alternative (storing a `group_id` or a parent-child schema in `tool_calls`) would have given us the same UX at the cost of a schema migration, a backfill for historical messages, and a permanent constraint on future grouping changes. Render-time wins on every axis except code locality, which isn't a meaningful loss here.

**Alternatives considered:**

- *Store rendered numeric markers in the body (`[1]`, `[2]`, …).* Rejected — any edit, regeneration, or source-list reorder would corrupt the link between marker and source. Numbers must be derived, not stored.
- *Use a remark plugin to define a custom `[^src_xxx]` citation syntax.* Rejected — adds a permanent plugin dependency to maintain across remark upgrades; HTML `<sup>` does the same work with no plugin surface.
- *Persist tool-call grouping in the DB via a `tool_call_group` table or a `group_id` column on `messages.tool_calls`.* Rejected — locks the grouping rules into a schema. Adjacent + same-name is the right rule today; a future product call (e.g. "group by query intent across non-adjacent calls", "always show parallel calls collapsed but sequential calls separately") would require a migration. Render-time computation absorbs the change cost-free.
- *Group tool calls server-side at stream time before persistence.* Rejected — same lock-in concern as DB-level grouping. Plus the streaming pipeline is the most fragile part of the stack (Session 18 surfaced two distinct bugs in it during smoke); adding logic there with no schema win is the wrong trade.

**Consequences:**

- The persisted `messages.content` body is no longer pure markdown — it carries inline `<sup data-source-id="...">` HTML. Any future renderer that consumes `content` must either (a) accept HTML, (b) strip the markers (the docx export does this — `lib/exports/docx.ts:CITATION_MARKER_RE`), or (c) translate them to its own citation format.
- `rehype-raw` is a permanent dependency in the markdown pipeline. The sanitize schema's `sup[data-source-id]` whitelist is the only authorized HTML-attribute-bearing tag the pipeline accepts; adding more attributes or tags requires extending `citationSchema` in `markdown-renderer.tsx` and is a security-review-worthy change.
- `tool_calls` JSONB stays at one-record-per-tool-use-id forever. A future change to grouping rules edits `buildBlocks` only — no migration, no backfill, no historical-data risk. The persisted shape carries the fine-grained truth; presentation reshapes it.
- The citation-after-text positioning (Step C addendum) is a single-source-of-truth fix at the server-side stream handler, not a render-time post-processor. Markers are persisted in their final position by the time the assistant message INSERT runs. Old messages persisted before the fix retain their pre-period placement; we accept that as historical and don't backfill. This means a regeneration of an old message will produce a body with markers in the new (after-period) position while sibling old messages retain the old position — visible inconsistency only at the boundary, which is acceptable.
- The grouping rule's "trim() === '' between positions" definition has one edge: tool calls with the same `position` offset (parallel calls fired without writing prose between) always group regardless of the trim check, because `slice(N, N) === ""` trivially. Future tools that write meaningful position-distance metadata (e.g. "this tool ran on retrieved doc X, this one on doc Y, in conceptually different parts of the response") would need a different signal — a `group_hint` field on the tool call record, or a name-based grouping override. Not a problem today; flagged for if/when a non-search server tool lands.

---

## D-035 — Open signup posture deferred to post-Phase-2

Date: 2026-05-05
Status: Accepted (with sunset)

**Context:** Session 20 Step B recon identified that `ensure_user_provisioned` (RPC called by `proxy.ts` on every authenticated request) auto-provisions any authenticated email into the single-tenant org as `role='user'` with zero department roles. There is no invitation gate, no email allowlist, no pending-approval state. Combined with Supabase magic-link auth defaults (no domain restriction), the practical posture is: anyone who knows the production URL and has any email account can become an inert org member.

**Decision:** Defer the invitation gate. Accept the open signup posture for the remainder of Phase 2.

**Reasoning:** For the small group of trusted feedback users in Phase 2, strangers becoming inert `role='user'` rows with no department access is harmless — they see the empty-state landing, can't navigate into anything (everything 404s or 403s), and the metadata leaks were closed by migration 0015. The cost of a proper invitation gate (`auth_invitations` table, admin UI to send invitations, pending-approval state, gating `ensure_user_provisioned` on invitation existence) is real engineering work that doesn't earn its place against the actual threat model right now.

**Alternatives considered:**

- *`auth_invitations` table + admin invite UI.* Strongest, but full-session scope.
- *`is_active=false` default + admin-flip workflow.* Medium scope, requires a "pending approval" branch in the workspace landing.
- *`allowed_email_domains` column + domain-match check in `ensure_user_provisioned`.* Lightest scope, but breaks for legitimate users with non-matching emails (gmail accounts of trusted reviewers).

**Consequences:**

- Production URL must be treated as semi-private through Phase 2 — sharing widely creates inert account growth in `public.users` (cosmetic, not exploitable).
- Before Phase 3 broader rollout (or before the landing-page session if external users are expected), an invitation gate is required.
- The empty workspace landing's "Request access from your admin" mailto (added in Session 20) is the user-facing surface for now.

**Sunset condition:** This entry expires when EITHER (a) the production URL is publicized to non-trusted users (e.g., a public landing page goes live with a sign-up flow), OR (b) an invitation gate is implemented. Whichever comes first.

---

## D-036 — Workspace relocation to /workspace prefix and marketing landing at /

Date: 2026-05-07
Status: Accepted

**Context:** The existing app structure had every authenticated route living at the root, with no provision for a public marketing surface. The roadmap (`PROJECT_OUTLINE.md`, Phase 2 work) called for a public landing page that doubles as the auth entry point, routing visitors to `/workspace` where the auth gate lives.

**Decision:** Move the entire authenticated surface to `/workspace/*` via a route-group rename (`app/(workspace)` → `app/workspace`). Replace the temporary one-line redirect at `app/page.tsx` with a real marketing landing. The CTA always routes to `/workspace`; the existing `proxy.ts` middleware gates the auth check from there. `proxy.ts` updated to allowlist `"/"` as a public path.

**Reasoning:** Path-based separation (Linear/Vercel pattern, `/` marketing + `/workspace` app) was preferred over state-based rendering (GitHub pattern, single `/` serving different content by auth state) because shareable URLs stay deterministic, SEO behavior is unambiguous, and the mental model scales as the app grows. Subdomain split (Stripe pattern, `marketing.legalos` + `app.legalos`) was the better long-term answer but requires a custom domain that's deferred until product naming is locked. Path-based is the right call at the current `vercel.app` stage. The migration cost was paid once via mechanical find-and-replace across `Link` `href`, `redirect()`, `revalidatePath()`, pathname matchers, breadcrumb route table literals and regex anchors, and `WorkspaceNavLink` prefix checks. Auth callback's default fallback shifted from `/` to `/workspace` so a magic-link click without an explicit `?next=` lands on the workspace, not on marketing.

**Alternatives considered:**

- *GitHub-style state-based root.* Rejected — confusion compounds as the app grows; SEO and shareable-URL semantics get muddier with each surface.
- *Subdomain split (`marketing.*` + `app.*`).* Correct long-term answer; deferred until a custom domain replaces the current `vercel.app` URL.
- *Workspace at root, marketing under `/landing` or `/home`.* Rejected — marketing should be the canonical public URL.

**Consequences:**

- Every internal path reference under `app/`, `components/`, and `lib/` now lives under `/workspace`.
- The breadcrumb's leading `workspace` segment is now a `Link` to `/workspace` itself.
- `proxy.ts` allowlists `"/"` as public; everything else outside `/login` and `/auth/callback` continues to require auth.
- `?next=` preservation in the proxy is still deferred (called out at `proxy.ts:24`). When implemented, it becomes a small follow-up.
- The `vercel.app` site URL no longer redirects from `/` to a workspace landing; it serves the marketing surface.

---

## D-037 — Light-mode palette retune: warm-tan family lifted proportional to sRGB headroom

Date: 2026-05-07
Status: Accepted

**Context:** The Aperture palette as originally specified produced a noticeably warm-grey page surface that read as heavier than intended once the marketing landing went up alongside the workspace. The user requested a lighter overall surface treatment across all pages, with proportional shifts to the related warm-tan tokens to preserve family coherence.

**Decision:** Lift every warm-tan family token in light mode by an OKLCH lightness delta proportional to its sRGB headroom. Tokens with starting L below 0.97 bumped by +0.02. Tokens with starting L at or above 0.97 bumped by +0.01 (capped to avoid sRGB clipping at L=1.0). Hue and chroma preserved across all tokens. Foreground tokens (`ink`, `ink-2`, `mute`, `caption`) and accent tokens (`primary`, `accent-hover`, `primary-hover`) untouched — only the surface family shifted.

**Reasoning:** A flat +0.02 across the family produced clipping on `--muted`, `--paper-2`, and `--sidebar-accent` (all at starting L 0.9823, which clamps to white at L=1.0023). Clipping collapses three distinct hover/wash tokens into indistinguishable pure white, which would have eroded the warm cast at the brightest end of the family. Proportional deltas preserve the relative spread between tokens while still achieving the overall lift. Cards and form-field surfaces additionally received a follow-up lift from L 0.986 to L 0.992 to restore the card-vs-background tonal step from 0.007 to 0.013, after the initial pass left cards reading too close to the page bg. `--primary-foreground` and `--sidebar-primary-foreground` (the paper-on-primary tokens for cream text on slate-blue surfaces) lifted to track the new `--background` L value, preserving their semantic pairing.

**Alternatives considered:**

- *Flat +0.02 across all tokens.* Rejected — three tokens clipped at the sRGB ceiling.
- *Smaller flat delta (+0.01) across all tokens.* Rejected — mid-range tokens (`border`, `hairline`, `secondary`) had headroom and benefitted from the larger bump; capping them at +0.01 under-delivered on the requested lift.
- *Re-author the entire palette.* Rejected — the Aperture family identity (warm cast, low chroma, OKLCH-coordinated) is intentional and earned.

**Consequences:**

- `docs/design/aperture/README.md` hex references no longer match production CSS. The README is annotated with a header banner pointing to `app/globals.css` as canonical.
- Inline hex comments in `app/globals.css` updated to reflect the new computed values per token.
- All consumer surfaces (workspace, agent pages, edit forms, chat, landing, login) inherit the lighter palette automatically — no per-component overrides.
- The palette shift is a one-time change. Future palette retunes should follow the same proportional-headroom methodology and supersede this entry rather than amending.

---

## D-038 — D-035 status: marketing landing public but no signup shipped, threat model unchanged

Date: 2026-05-07
Status: Annotates D-035

**Context:** D-035 (open signup posture deferred to post-Phase-2) listed two sunset triggers: (a) the production URL is publicized to non-trusted users via a public landing with a sign-up flow, OR (b) an invitation gate is implemented. Session 22 Step B made `/` publicly accessible by allowlisting `"/"` in `proxy.ts`'s `PUBLIC_PATHS`, but the landing's only CTA routes to `/workspace` which remains auth-gated. No signup flow exists.

**Decision:** D-035 is not yet sunset. Trigger (a) is half-met (public landing exists), trigger (b) is unmet (no invitation gate). The "Request access" link on the landing is a `mailto`, not a sign-up form, which preserves the original threat model — visitors must email before being added.

**Reasoning:** Documenting the current state explicitly so future sessions reading D-035 don't assume the trigger fired silently. When the invitation gate eventually ships, a fresh D-entry will sunset D-035 with the explicit transition.

**Consequences:**

- D-035's deferral remains active.
- The landing's `mailto` Request access link is the de facto invitation gate at the current stage.
- Free-tier Supabase email rate limit (2/hour) remains the operational constraint that's preventing wider URL sharing.

---

## D-039 — Login surface state machine, visual polish, and authed-user bounce

Date: 2026-05-09
Status: Accepted

**Context:** The Phase 1 login surface was a bare HTML form (`text-2xl` heading, raw `<input>` and `<button>` with utility classes, vertically and horizontally centered) that did not match the marketing landing’s quality bar. Two functional issues compounded the visual gap. First: on submit, the page redirected to `/login?message=check-inbox` and re-rendered with the form still visible PLUS a status box appended below it — to a user, this read as a re-prompt, not as confirmation. Second: authenticated users hitting `/login` saw the form and could submit again, with no bounce to `/workspace`. Session 23 addressed all three in one commit.

**Decision:** Replace the bare form with a polished surface that mirrors the marketing landing’s typography, x-axis anchor, masked-reveal motion vocabulary, and primary CTA treatment. Drive a two-state UI off the existing `?message=check-inbox` querystring: form state OR confirmation state, never both. The confirmation replaces the form rather than annotating it. Echo the submitted email in the confirmation via an httpOnly cookie (`legalos_pending_email`, path-scoped to `/login`, 10-minute TTL), set in the server action regardless of `signInWithOtp` outcome to preserve the no-leak posture. Provide explicit Resend and Use-different-email actions. Add an authed-user bounce in `proxy.ts`: authenticated users hitting `/login` get redirected to `/workspace`, with refreshed Supabase session cookies copied across the redirect per the file’s existing CRITICAL note. `/auth/callback` remains reachable for authed users so old magic-link clicks still resolve.

**Reasoning:** The pattern shipped (dedicated page, full state transition on submit, email echo, explicit resend and change-email actions) matches what Linear, Vercel, Notion, Cursor, Stripe, and Raycast all use for magic-link flows. Modal auth was rejected — easier to dismiss accidentally, less serious tone, accessibility footguns. Persistent-form-with-status-box was rejected as the bug it was, not a design choice — users read it as a re-prompt. Email echo via httpOnly cookie was preferred over URL-querystring carry (would expose email in browser history and Vercel logs) and over client-state carry (form-action redirects break client state). Cookie path-scoped to `/login` so it never travels to `/workspace` or any other surface. Cookie set on both success and `signInWithOtp` failure to avoid signaling delivery failure via cookie absence — preserves the principle codified in the original `actions.ts` comment. The authed-user bounce was lifted in alongside the polish because it is a five-line `proxy.ts` change adjacent to the work; shipping login polish without it would leave an obvious rough edge. The visual polish was batched into one prompt per the Session 22 lesson on serial visual edits.

**Alternatives considered:**

- *Modal sign-in instead of dedicated page.* Rejected — modal auth is dated, has accessibility footguns, and is easier to dismiss accidentally.
- *Keep form visible with status box (prior behavior, just visually polished).* Rejected — the bug is the bug; visual polish does not fix the re-prompt reading.
- *Carry the email via URL querystring.* Rejected — exposes email in browser history, Vercel logs, and referrer headers.
- *Client-side state for the form-to-confirmation transition.* Rejected — server-action redirects break client state; the cookie plus server-component pattern is simpler and more durable.
- *Defer the authed-user bounce to a later session.* Rejected — adjacent to the work, five lines, ships clean now.
- *Static `LandingGlyph` echo on the right side at desktop widths.* Rejected — empty negative space is the more confident move on a functional surface; the landing already establishes glyph identity.

**Consequences:**

- The login surface now reads as part of the same product as the marketing landing — same wordmark, same x-axis anchor, same masked-reveal entrance, same primary CTA.
- Post-submit reads as confirmation, not as a re-prompt. The form is fully replaced.
- `legalos_pending_email` cookie is the only piece of cross-request state introduced by the login surface. Path-scoped, httpOnly, 10-minute TTL.
- Authenticated users navigating to `/login` are redirected to `/workspace` instantly; old magic-link clicks via `/auth/callback` continue to work.
- `"use server"` files cannot export non-async-function constants, so the cookie name is duplicated as a literal in `actions.ts` and `app/(public)/login/page.tsx` with sync-warning comments. Acceptable — the literal is short and the two locations are adjacent.
- No layout file under `app/(public)/login/` — there is no other surface in that group, so a layout wrapper would be ceremony.
- The Supabase free-tier email rate limit (2/hour) remains the binding constraint on testing. Custom SMTP via Resend is the next session’s prerequisite work.

## D-040 — Custom SMTP via Resend (sandbox mode)

Date: 2026-05-11
Status: Accepted

**Context:** Supabase Auth’s default email provider caps at 2 messages per hour on the free tier. That cap is the binding constraint on smoke-testing the magic-link flow end-to-end — a single login attempt followed by a resend exhausts the quota for the hour, making it impossible to verify the surface shipped in Session 23 (D-039) under realistic conditions. The 2/hour cap also blocks the prerequisite work for the invitation gate that sunsets D-035: any cohort larger than the operator cannot be onboarded for trusted-reviewer feedback without first lifting the email rate limit.

**Decision:** Configure Supabase Auth to route magic-link emails through Resend’s SMTP server in sandbox mode. The Next.js application code is unchanged — `signInWithOtp` continues to call Supabase Auth, which now delegates the SMTP transport to Resend instead of its own default sender. Configuration lives entirely in Supabase’s hosted dashboard (Authentication → SMTP Settings) and Resend’s dashboard; no env vars, no migrations, no application changes.

Sandbox mode uses the `onboarding@resend.dev` sender address with display name `legalOS`. Resend’s sandbox constraint limits delivery to a single recipient: the email address used to create the Resend account. Sends to any other recipient fail with a 403 in Resend’s email log. This is sufficient for solo operator smoke-testing of the magic-link surface and the rate-limit lift, but does not unblock broader cohort delivery.

**Reasoning:** Resend was chosen over Postmark, SendGrid, and AWS SES because it’s the modern developer-focused option with the cleanest Supabase integration story, a generous free tier (3,000/month, 100/day), and a documented sandbox path that requires zero DNS work. The 3,000/month cap is well above any plausible smoke-testing or trusted-cohort volume through Phase 2. Native Resend-Supabase integration via the Supabase Integrations marketplace was rejected in favor of manual SMTP credential paste — the SMTP path is more portable across providers should Resend ever need to be swapped, and the integration’s value-add is dashboard convenience rather than a different transport mechanism.

Sandbox mode (rather than verified custom domain) was chosen because the custom-domain question from D-036 is still deferred. Provisioning a domain solely to lift the 2/hour cap for solo smoke-testing would force premature naming and infrastructure decisions. Sandbox mode lifts the binding constraint immediately and defers the domain decision to its natural place: when broader-cohort delivery is actually required, i.e., when the invitation gate that sunsets D-035 is ready to ship.

**Alternatives considered:**

- *Stay on Supabase’s default SMTP and accept the 2/hour cap.* Rejected — cap is the binding constraint on testing Session 23’s work and blocks the invitation-gate prerequisite.
- *Postmark, SendGrid, or AWS SES instead of Resend.* All viable. Postmark and SendGrid have longer track records; SES is cheapest at volume. Rejected on dev-experience and Supabase-integration-quality grounds; the volume argument doesn’t apply at this stage.
- *Native Resend-Supabase integration (marketplace).* Rejected — SMTP credential paste is more portable and the integration’s value-add is convenience, not a different transport. Easier to reason about and to swap providers later.
- *Provision a custom domain now to skip sandbox mode entirely.* Rejected — couples the SMTP decision to the deferred domain-naming decision from D-036. Sandbox mode lifts the binding constraint without taking on that coupling.
- *Configure Supabase Auth to use Resend’s HTTP API directly via webhook.* Rejected — out of scope; Supabase’s SMTP integration is the documented, supported path.

**Consequences:**

- The 2/hour magic-link rate limit is lifted; the binding constraint on Session 23 testing and on invitation-gate prerequisite work is gone.
- Magic-link emails are sent from `legalOS <onboarding@resend.dev>` via Resend’s SMTP. The “via resend.com” line in email clients makes the routing visible.
- Sandbox mode constrains delivery to the operator’s Resend account email. Any attempt to send to a different recipient (a trusted reviewer, a teammate) silently fails from the Supabase side and shows a 403 in Resend’s email log. The invitation gate that sunsets D-035 therefore remains blocked on custom-domain provisioning, not on email infrastructure.
- Supabase imposes a separate 30/hour rate limit on newly configured custom SMTP, adjustable at `/dashboard/project/_/auth/rate-limits`. Sufficient for smoke-testing; a future load-test session would need to lift it.
- SMTP credentials (Resend API key as password) live in Supabase’s dashboard, not in `.env.example` or Vercel env. No env-var noise added.
- The Resend account is tied to a single operator email. Per-environment credential separation (dev/preview/prod) and team-shared access are both deferred to the custom-domain session.
- DNS-level sender authentication (SPF, DKIM, DMARC) is sidestepped entirely because `resend.dev` has those records configured by Resend. These become required work when a custom domain replaces the sandbox sender.

**Sunset condition:** This entry is superseded when a verified custom domain replaces `onboarding@resend.dev` as the sender. At that point, broader-cohort delivery unblocks, the invitation gate’s email-delivery prerequisite is satisfied, and the per-environment credential question (one Resend account vs. split) is decided.

## D-041 — Direct-manipulation inline edit for admin-editable copy

Date: 2026-05-12
Status: Accepted

**Context:** Department descriptions in production had drifted from accurate copy — the Commercial card’s `"Contract review, vendor agreements, commercial operations."` surfaced the issue, and the other seven descriptions had likely drifted similarly across migrations 0012 (Product / Compliance / Operations added) and 0013 (GRRA merged into Public Sector, General Tools added). These descriptions are stable copy, not dynamic agent summaries: they describe the *scope* of a department’s work, which is independent of which specific agents currently exist in it. Two design questions arose. Where should the editing surface live — a separate `/workspace/admin/departments` route, or inline on the workspace landing where the descriptions already render? And which admin tier should be able to edit — any admin role (super_admin, org_admin, dept_admin), or only the org-level admins whose authority maps to cross-department concerns?

**Decision:** Inline edit on the department card, super_admin / org_admin only. The card grows a hover-revealed pencil affordance at top-right (`opacity-0` default, fades in on hover or `focus-visible`, `motion-reduce:opacity-100` fallback). Click swaps the description text for a textarea plus Save / Cancel buttons. ⌘+Return / Ctrl+Return saves (matching Session 17b’s chat-composer keyboard contract), Escape cancels, plain Enter is newline. Optimistic update via `useTransition` (matching Session 17a’s model-picker pattern). dept_admin is intentionally excluded from the role gate to match the existing RLS write policy on `public.departments` — `departments_org_admin_write` from migration 0001 — which restricts writes to super_admin / org_admin.

The card’s surrounding `<Link>` swaps to a `<div>` during edit mode so unsaved work can’t be lost via an accidental click on card chrome navigating to the department detail page. The hover-lift treatment from Session 17a (slate-blue accent, `-2px` translate, shadow grow) is dropped on the div variant — the lift classes simply aren’t included in that variant’s className composition, so the card visually settles into a “locked to current state” mode without separate styling logic.

A new helper `isCurrentUserOrgAdmin()` was added to `lib/auth/access.ts`. It returns true only for super_admin / org_admin and mirrors the `departments_org_admin_write` RLS predicate exactly. The existing `isCurrentUserAdmin()` — which also returns true for dept_admin — is preserved for use cases where dept_admin should still pass (admin route gating, the workspace rail profile dropdown’s “Admin” visibility check). Both helpers now live side by side; callers pick the one whose scope matches the action they’re gating.

The seed file at `supabase/seed/0001_org_and_departments.sql` was deliberately not updated in this session. Production copy will be edited live via the new affordance once deployed; forcing the operator to hand-write all eight descriptions before seeing the UI defeats the “edit where noticed” pattern this session establishes.

**Reasoning:** Direct manipulation is the established convention in cutting-edge product design — Linear, Notion, Vercel, Figma, Cursor all follow it. The pattern: the thing you want to edit is the thing you click; permission-gated affordances hide from users who can’t use them. Admin routes are an artifact of older product design where “admin” was a separate persona; modern products treat admin as “same person, more permissions, same flow.” For an operator who notices a copy issue while looking at the department grid, the natural action is to fix it where it’s noticed, not context-switch to a settings page.

Permission-gated affordance scope must match RLS scope. The earlier `isCurrentUserAdmin()` helper returned true for dept_admin even though `departments_org_admin_write` excludes them — using that helper for this affordance would surface a pencil that produced an opaque “permission denied” on save for dept_admin users. The new helper exists to keep app-layer gating in sync with DB-layer gating. The principle generalizes: when adding affordances for actions backed by RLS-restricted writes, build a helper that mirrors the RLS predicate exactly rather than reusing a broader role check.

The Link → div swap during edit mode is a small piece of plumbing but the right semantic shape. Navigation truly isn’t available mid-edit; rendering an `<a>` whose `onClick` calls `preventDefault` would be a lie at the HTML level. The div variant also naturally disables the hover-lift treatment because the lift classes are only included in the Link variant’s className composition — no separate `isEditing` styling branch needed in the component.

Optimistic update was preferred over server-only revalidation because the model-picker precedent in Session 17a already established the pattern. Consistency wins over alternative validation strategies that have no specific reason to differ here.

**Alternatives considered:**

- *Separate `/workspace/admin/departments` admin route.* Rejected — context switch defeats the operator’s natural flow; “go find a settings page” is the older pattern that direct manipulation replaces.
- *Modal-based editor (click pencil → modal opens).* Rejected — modal is the right pattern for multi-field forms; for a single short string the modal ceremony is heavier than the edit warrants.
- *Popover-based editor.* Rejected — popovers help when the source element is too small to be the edit surface, which the card isn’t.
- *Wider role gate including dept_admin (with corresponding RLS migration).* Rejected — department descriptions are an org-level concept; dept_admin’s authority is scoped to their own department, not the cross-department structure. Tightening the app-layer check to match RLS is simpler than widening RLS to match a broader app-layer check, and the resulting permission boundary is more defensible.
- *AI-generated department descriptions from the agent list.* Rejected — description is *scope*, not contents; a correct summary should remain accurate after adding a new agent that fits the existing scope. Generation also introduces variance, regeneration-trigger complexity, and API cost for copy that changes rarely.
- *Hard-coded department descriptions in source (per-deploy strings).* Rejected — descriptions are data, not code; they belong in the database. Eight strings is a maintenance pattern that scales fine but doesn’t earn its keep as code.
- *Updating the seed file in this session.* Rejected — production gets edited via the new affordance; forcing the operator to write all eight descriptions before seeing the UI defeats the “edit where noticed” pattern.

**Consequences:**

- The direct-manipulation pattern is now the project’s convention for short admin-editable copy. Future similar work (department names, agent descriptions, calculator labels, invitation copy) inherits the shape: client-component editor with local state, server action mirroring `lib/actions/agents.ts`’s pattern (auth → role → Zod → UPDATE → revalidate), optimistic update via `useTransition` with `toast.error` revert on failure, hover-revealed affordance using the established `opacity-0 group-hover:opacity-100 focus-visible:opacity-100 motion-reduce:opacity-100` class composition.
- `isCurrentUserOrgAdmin()` is now available. Mirror-RLS-exactly is the convention for any new admin-gated affordance whose backing action is RLS-restricted to org-level admins. The choice between `isCurrentUserAdmin()` and `isCurrentUserOrgAdmin()` is the choice between “any admin tier can act here” and “only org-level admins can act here.”
- `DepartmentCard` is now a client component. Card-level transient state has a place to live; future card-level features (delete confirmation, reorder drag handle, hover-revealed metadata) can attach without further refactor.
- `supabase/seed/0001_org_and_departments.sql` still contains the original (now inaccurate) department descriptions. A fresh local dev environment will produce the old copy. Acceptable through Phase 2; a future consolidation session — perhaps when multi-org ships, perhaps sooner — should update the seed to match whatever production copy has converged on.
- dept_admin users see the workspace landing but cannot edit department descriptions. The visible behavior (no pencil affordance for dept_admin) matches the underlying RLS predicate. If a future decision widens dept_admin’s authority over their own department’s description, both the RLS write policy and the app-layer helper need to change in lockstep.

## D-042 — Pattern B canonical templates: activation, admin lifecycle, and chat-with-template UX

Date: 2026-05-13
Status: Accepted

**Context:** Templates infrastructure has existed since Session 8a (D-025 — the native-agent runtime built alongside user-owned agents) and Session 8f-A (the fork pattern, anchored by `forked_from_agent_id` FK with `ON DELETE SET NULL`). Pattern B — canonical org-curated templates that users fork — was the intent but had never been activated. Session 21 deliberately retired the launchpad’s Templates section pending product clarity on who curates and how.

Session 27’s framing surfaced the real shape. In-house legal departments and law firms need a curated set of approved agents per department, with knowledge-management or org-admin lead curating; sole practitioners don’t need templates and just create user-owned agents directly. The “Department Agents” a user saw on the launchpad before Session 27 were system-seeded rows with `is_template = false` — semantically intended as canonical but flagged wrong. Three product surfaces needed coherent treatment in one session: who can manage templates, what users do when they click one, and what visual signals communicate “this is the org’s canonical version.”

**Decision:** Activate Pattern B. Migration 0019 flips `is_template = true` on every `created_by IS NULL` row (15 rows in dev). Templates surface on the department launchpad as “Department Agents” — the user-facing label preserved from the prior section title for semantic continuity. Users think “the firm’s NDA review tool,” not “the NDA review template”; admin surfaces (edit-page banner, trash chip) use Template vocabulary where the technical specificity matters.

Admin lifecycle on templates — edit, soft-delete, create — is gated to super_admin / org_admin only via Session 26’s `isCurrentUserOrgAdmin()`. dept_admin is intentionally excluded at the application layer; templates are org-wide artifacts, and centralized curation matches the customer model for the foreseeable cohort.

The edit surface reuses `/workspace/agents/[id]/edit` with a permission tweak (gate widened from “owner only” to “owner-of-non-template OR org-admin-of-template”) and a warn-palette banner above the form: *“Edits to this agent affect everyone in your organization. Existing conversations keep their original system prompt; new conversations will use your edits.”* The second sentence is load-bearing — it surfaces the snapshot semantics in plain language without leaking the word “snapshot.”

Soft-delete uses existing Session 8f-B infrastructure with 30-day undo. The shared `/workspace/agents/trash` surface widens for admins: it now lists template deletions alongside the admin’s own user-owned deletions, with a “Department Agent” chip on template rows for scannability. Non-admins continue to see only their own user-owned deletions.

Click behavior on Department Agents: primary click navigates to `/workspace/agents/<template-id>` — the chat surface, not the fork form. Fork-on-click is retired. This is the substantive product-correctness change: interaction-first products separate use from customization. Forking on click conflated them; clicking now lets users converse with the firm’s canonical version without creating a personal copy until they deliberately want one.

The Customize affordance is chat-surface only, post-engagement. The top-right corner of `agent-header.tsx` (where Edit lives for owned agents) renders “Customize” for non-admin users viewing a template. Clicking forks the agent AND copies the active conversation (if one exists) into a fresh conversation under the new agent. The original template’s conversation stays attached to the template, untouched. Snapshot semantics on the copied conversation: re-snapshot from the new agent (not preserve the source’s snapshot), so future template edits don’t ghost-update the user’s prompt and future edits to the user’s fork land on subsequent conversations as expected.

The template signal is a persistent “Department Agent” chip in the agent header meta-chip row using Aperture’s slate-blue mono-caps vocabulary (matching the existing Web Search chip). Renders whenever `agent.is_template` is true, regardless of viewer. No first-turn banner — passive persistent context is the cutting-edge convention.

Three-way top-right slot logic in `agent-header.tsx`:
- owner-of-non-template → Edit link.
- template + `canManageTemplates` → Edit link (admin path).
- template + `!canManageTemplates` → Customize button.
- soft-deleted → no top-right action.

Schema decisions surfaced in Step A.2 research were confirmed by reading. Conversations remain user-scoped via existing `conversations_user_owns` RLS — multiple users chatting with the same template each get their own thread automatically, no schema work needed. `system_prompt` and `model` are snapshotted per-conversation at creation time (per migration 0004’s design intent and CLAUDE.md’s AI Integration Rules), so admin edits don’t disturb in-flight conversations. `tools_enabled` and `agent_attachments` are NOT snapshotted — flagged in Consequences as behavior to monitor.

`forkAgentFromConversationAction` implementation: three-step transactional insert (new agent → new conversation → bulk message insert) with best-effort soft-delete rollback on conversation-copy failure. Users have no DELETE policy on agents (migration 0010 is UPDATE-only), so hard rollback isn’t available via the user-scoped client; soft-delete via `deleted_at = now()` hides the orphan and lets it surface in the admin’s 30-day trash window for recovery or eventual cron hard-delete.

**Reasoning:** Templates as data, not code: the pattern survives multi-tenant rollout cleanly. Each org curates its own templates; the schema’s `organization_id` scoping does the work.

“Department Agents” user-facing label vs. “Template” engineer-facing label: the cutting-edge convention is to never leak data-model vocabulary as user-facing copy unless users think in those terms (Notion, Linear, Figma, Cursor consistently). Legal practitioners think “the firm’s NDA review tool,” not “the NDA review template.” Admin surfaces use Template vocabulary where technical specificity matters.

Chat-with-template vs. fork-on-click: ChatGPT’s GPT Store, Cursor’s community modes, Figma’s Community files — all converged on click-to-use, fork-as-deliberate-action. Forking on click pollutes My Agents with one-off copies and treats engagement as a heavyweight commitment. The user’s mental model is “use the firm’s tool”; customization is what happens when usage reveals a gap.

Conversation copy on Customize: when the user clicks Customize mid-conversation, what they were doing matters. Carrying the conversation into the new copy preserves that intent. Starting the user’s copy with an empty thread treats the prior conversation as throwaway. Re-snapshotting from the new agent (rather than preserving the source’s snapshot) is the cleaner option: at fork-creation time the new agent’s prompt equals the template’s current prompt, so re-snapshotting produces identical content with cleaner downstream semantics — admin edits to the template don’t ghost-update the user’s prompt, and user edits to their fork land as expected on subsequent conversations.

Persistent chip vs. one-time banner: chips are passive context users learn once and absorb forever; banners are temporary state requiring dismissal. The chip carries the load.

Org-admin-only (not dept-admin) for template management is tighter than RLS allows. Session 26’s D-041 established the mirror-RLS principle — don’t surface affordances that would 403 because of an RLS gate. Session 27 inverts the framing: deliberately narrower than RLS for product-policy reasons (templates are org-wide artifacts; centralized curation matches the customer model). Worth flagging because the tightening direction is opposite D-041’s and the reasoning is product, not technical.

Edit-page reuse vs. dedicated `/admin/templates` route: same underlying schema, same form fields, same validation. Building a parallel route for template editing would duplicate ~200 lines of form logic for a gate-and-banner difference. The reuse path with permission tweak + visual signal is the right scope now; if template editing diverges significantly later (draft/publish, version history, approval queue) a dedicated route earns its place at that time.

**Alternatives considered:**

- *Hard-coded department agent descriptions edited via deploy.* Rejected — descriptions are data, not code; D-041 established the principle for department descriptions, same logic applies to agents.
- *AI-generated descriptions from agent contents.* Rejected — system prompts and names are stable curated copy; AI generation introduces variance for copy that’s authored once and edited rarely.
- *Click-to-fork (pre-Session-27 behavior).* Rejected — conflates use with customization; pollutes My Agents with one-off exploratory copies; doesn’t match how legal practitioners engage with firm tools.
- *Customize affordance on the card alongside chat affordance.* Rejected — asks the user to make a meta-decision on every hover; cutting-edge convention is fewer affordances doing more work, with customize entering at the moment of revealed need (mid-conversation).
- *Modal-based template edit.* Rejected — same logic as D-041; modals are for multi-field forms with significant ceremony; template edit is a full form better suited to a dedicated page.
- *dept_admin role widened to template management with corresponding RLS migration.* Rejected — increases scope without earning its place against the current product policy of centralized template curation; the dept_admin role can be revisited if a customer specifically asks for it.
- *Dedicated `/admin/templates/[id]/edit` route.* Rejected — duplicates form logic for a gate-and-banner difference; reuse path with permission tweak is the right scope.
- *Snapshot semantics: preserve source conversation’s snapshot on fork.* Rejected — creates a ghost-update problem when an admin later edits the template; re-snapshotting from the new agent is cleaner downstream.
- *First-turn banner on chat-with-template surface.* Rejected — passive persistent chip is the cutting-edge convention; banners are temporary state requiring dismissal.

**Consequences:**

- Pattern B is now active. Templates are org-level artifacts curated by org-admins, forkable by any user, surfaced as Department Agents on the launchpad.
- The direct-manipulation pattern (D-041) extends from short admin-editable copy to full template lifecycle. Users see admin affordances only when `canManageTemplates` resolves true; the affordance shape (overflow menu with Edit + Delete, confirmation dialog with org-stakes copy, toast Undo) mirrors the MyAgentCard pattern from Session 8f-B with permission scope widened.
- “Customize” establishes fork-from-conversation as a first-class operation in the product. The schema supports it cleanly; the action is reusable for any future fork-with-history flows (template-of-template, conversation snapshots, etc.).
- `isCurrentUserOrgAdmin` remains the org-level admin gate. The mirror-RLS principle from D-041 is **not** universal — Session 27 deliberately gates tighter than RLS for product-policy reasons. Future similar product-policy gates should explicitly note the divergence in their own ADR.
- `tools_enabled` and `agent_attachments` are NOT snapshotted per-conversation — they read live from the agent row per turn. Admin edits to a template’s web-search toggle or attached files will propagate to in-flight conversations on the next turn. This is the existing schema’s behavior (not a Session 27 introduction) but becomes more user-visible now that templates are admin-mutable. Acceptable for the customer cohort through Phase 2; if a customer surfaces a need for “edits are atomic at conversation boundary” behavior, snapshot `tools_enabled` and attachments at conversation creation alongside `system_prompt` and `model`.
- The fork-on-click code path (the `isTemplate` branch in `agent-card.tsx` routing to `/workspace/agents/new?fork_from=<id>`) is retired from card click. The new-agent page still accepts the `fork_from` URL param for explicit fork-from-template flows from the chat-surface Customize button.
- Trash now contains template entries visible to admins. Admins use trash for both their own user-owned deletions and the org’s template deletions; the chip distinguishes them.
- `createTemplateAgentAction` sets `created_by = NULL` on new templates (not the admin’s `user_id`). Templates are org-canonical, not personal — the NULL anchor places conceptual ownership at the organization, not at the individual admin who authored the template. Matches the pre-existing convention for seeded canonical agents.
- The conversation-copy step in `forkAgentFromConversationAction` is the largest piece of net-new code in this session. Failure handling uses best-effort soft-delete rollback because users have no DELETE policy on agents. Future hardening (RPC for true transactional rollback, or a service-role action) is acknowledged but deferred — current behavior produces a soft-deleted orphan that the admin can find in trash, not silent corruption.

## D-043 — Chat-surface centerline alignment: shrink-to-content regression fix and right-anchored user bubbles

Date: 2026-05-13
Status: Accepted

**Context:** Session 17b shipped the “single-centerline alignment” promise — every chat-surface element centered at the same x-axis. Verification at the time happened with longer message content that filled the 3xl ceiling, masking a latent issue.

Session 27’s smoke surfaced the regression: the agent header content, user message bubble, and assistant prose wrapper were not aligned for short content. Diagnosis traced to `mx-auto max-w-3xl` without `w-full` on three wrappers — `max-w-3xl` is a ceiling, not a width; without `w-full` the container shrinks to content width and `mx-auto` then centers a *shrunk* element, producing content-length-dependent x-coordinate variance.

Subsequent operator inspection raised a second perception concern: even with the centerline math correct, the chat surface didn’t *read* as a contained chat column the way ChatGPT / Claude.ai / Cursor surfaces do. Right-anchored user bubbles are the cutting-edge convention; the prior left-anchored bubble shape contributed to the “elements floating on a page” perception even when geometrically aligned.

**Decision:** Fix the shrink-to-content centerline regression by adding `w-full` to the three wrappers Session 17b missed:
- `agent-header.tsx:155` — flex container around name / description / chips / top-right action.
- `message-bubble.tsx` assistant variant — wrapper around prose + citations + download button.
- `message-bubble.tsx` user variant — restructured (see below).

Right-anchor user message bubbles. Replace the prior left-anchored `inline-block` bubble with `<div className="mx-auto flex w-full max-w-3xl justify-end">` outer wrapper plus a naked inner bubble (no `inline-block`, `max-w-full` retained as the per-bubble width cap). User bubbles now sit flush against the column’s right edge with shrink-to-content width capped at the column width. Matches ChatGPT, Claude.ai, Cursor, and the established messaging-app convention.

Chat-surface containment — the deeper “the column doesn’t read as a contained surface” perception — is deferred to Session 28 as its own focused effort.

**Reasoning:** The cutting-edge chat-surface convention right-anchors user messages. Every modern AI product (Claude.ai, ChatGPT, Cursor, GitHub Copilot Chat) and every messaging app (iMessage, WhatsApp, Slack) places user content on the right and counterparty content on the left. The pattern leverages a deeply-learned mental model: “what I said” lives on one side, “what they said” lives on the other. Left-anchored user bubbles forced the eye to derive the speaker distinction from styling alone (tinted card vs. bare prose) — which the Aperture spec already does — but right-anchoring layers on the spatial cue for free.

The shrink-to-content fix is a true regression. Session 17b’s CHANGELOG explicitly promised the centerline contract that wasn’t being delivered for short content. Acknowledged as a regression rather than a new feature.

Geometric measurement via browser console `getBoundingClientRect` confirmed alignment was correct after the `w-full` and right-anchor fixes — header content, user bubble outer wrapper, and composer all at the same x-coordinate. The remaining “chat surface still feels off” perception is a containment issue, not a centerline issue. Separating those problems lets each get its own clean session.

**Alternatives considered:**

- *Center user bubbles within the column.* Rejected — non-standard convention; breaks the user mental model from messaging-app context.
- *Keep left-anchored user bubbles.* Rejected — fails the conversational-back-and-forth pattern users expect from chat surfaces; even with centerline math fixed, the visual asymmetry between left-anchored user content and full-width assistant prose contributed to the “off” perception.
- *Address chat-surface containment in Session 27.* Rejected — would bloat a session already large with templates work; containment is a separate design call that warrants its own research and decision.

**Consequences:**

- Single-centerline alignment is now correctly delivered for content of any length. The `w-full max-w-3xl` pattern is the canonical wrapper shape for chat-surface elements; future additions should match.
- User bubbles use `flex … justify-end` as the new pattern. Assistant prose stays left-anchored full-column. The visual rhythm is now legibly back-and-forth.
- Chat-surface containment is deferred to Session 28 as a focused effort.

## D-044 — Chat-surface containment via top-boundary strengthening, composer-as-anchor, and empty-state elimination

Date: 2026-05-11
Status: Accepted

**Context:** Session 27 closed the centerline math (D-043 — added `w-full` to three wrappers, right-anchored user bubbles, verified header content + message wrappers + composer all at x=288 via browser `getBoundingClientRect`). Operator smoke then surfaced that geometric alignment alone didn’t resolve the deeper concern: the chat surface still didn’t *read* as a contained chat column. D-043 deferred this to Session 28 as its own focused effort.

Step A research established an architectural fact about the cutting-edge convention. Every modern AI chat surface — Claude.ai, ChatGPT, Cursor, GitHub Copilot Chat — uses what the research labels “contained without containing”: visual anchoring via a persistent composer card at the bottom + strong page padding + per-turn rhythm. None wraps the conversation column in a card with bg / border / shadow. legalOS already had the page padding and the composer card; what was missing was a deliberate top boundary and a stronger anchor signal at the composer. The agent header’s bottom hairline used `--border` (#f2ede3) — a barely-visible 0.013 lightness delta against the page background — and the composer had no upward-directional shadow signaling that scrollable content disappears beneath it.

A second product issue surfaced in the same smoke. The pre-first-message identity panel from Session 19 (`<ChatEmptyState>`, spec §2.8) duplicated the agent header’s name and description and added a facts row (Model / Web search / Last updated) that the agent header was already capable of showing. The empty state read as unpolished and reflected an older AI-product convention — the substantial welcome screen, the IBM Watson era — rather than the cutting-edge AI-native convention of trusting the user to know what they want and getting out of the way.

**Decision:**

*Top boundary strengthening (Decision A).* Two changes in `agent-header.tsx`: (1) bottom-border token upgraded from `border-border` to `border-hairline-strong` — same 1px width, stronger tone (#eae4d8 vs. #f2ede3, the documented “card outer chrome” tone in Aperture’s surface ramp); (2) breathing room below the header increased from `mb-4` (16px) to `mb-7` (28px) so the chat surface starts with a deliberate gap above the first message rather than rolling immediately into content. The combination reads as a deliberate threshold without resorting to a heavy border.

*Composer-as-anchor (Decision B).* Two changes in `message-input.tsx`: (1) the composer card’s shadow stack gains an upward-pointing layer at the top of the existing stack — `0_-8px_24px_-12px_rgba(0,0,0,0.08)` prepended to both the default and focus-within shadow strings, signaling that scrollable content disappears beneath this card; (2) outer wrapper’s bottom padding reduced from `pb-4` (16px) to `pb-2` (8px) so the composer sits closer to the chat surface’s bottom edge. The composer reads as a literal anchor at the surface’s base rather than a card floating in vertical space.

*Empty-state elimination.* The `<ChatEmptyState>` panel and its `chat-empty-state.tsx` file are deleted entirely. `MessageList`’s early-return branch that swapped in the panel when `messages.length === 0 && !isStreaming` is removed; MessageList now always renders the standard message-list path. `ChatInterface` no longer derives `isEmpty` or passes empty-state props. The model + web-search chips on `AgentHeader` (previously hidden when `emptyState` was true to avoid duplicating the panel’s facts row) now render unconditionally as part of the agent header’s meta-chip row. Net visual: when a user opens a fresh agent they see the agent header at top (name + description + Department Agent chip + model chip + web-search chip) and the composer at bottom, with empty space between. ChatGPT pattern.

*Double-`<main>` accessibility cleanup.* The workspace layout’s outer `<main>` (in `app/workspace/layout.tsx`) is demoted to `<div>` — it was structural chrome wrapping the rail-plus-content grid, not the page’s main content. The chat page already has its own `<main>` (semantically correct). The workspace landing page and the department-detail page, which previously returned fragments and relied on the layout’s `<main>`, gain their own `<main>` wrappers with `flex flex-col gap-9` to preserve the prior spacing behavior. Each page now has exactly one `<main>` landmark, satisfying the one-per-page accessibility contract.

**Reasoning:** The “contained without containing” pattern is the cutting-edge convention across every modern AI chat product. Wrapping the conversation in a contained card would have diverged from the convention rather than matching it. The investment was in the *boundaries* (top hairline, bottom composer anchor) and in *signaling depth* (the composer’s upward shadow), not in adding a container.

The Aperture surface ramp already contained the right token for the stronger hairline — `--hairline-strong`, documented in Session 22b’s palette retune as “card outer chrome.” The change is a one-token swap, not a token introduction; the design system was prepared for this.

The breathing-room change (`mb-4` → `mb-7`) follows the cutting-edge convention of “deliberate space as boundary” over “visible line as boundary.” Borders alone feel heavyset; the combination of stronger 1px hairline plus deliberate space reads as a higher-fidelity threshold than either piece alone.

Eliminating the empty-state panel honors the AI-native principle that users come to a chat agent already knowing what they want to do. The panel was orientation infrastructure that the agent header already provides redundantly. ChatGPT, Claude.ai, and Cursor all converged on the same pattern — empty middle, composer at bottom — because the underlying observation is consistent: welcome screens are an older paradigm from the era of “this is a complex system, here’s what you can do.”

The double-`<main>` fix was identified during Step A research and bundled because it’s accessibility-adjacent to the containment work (both concern the chat surface’s structural shape) and trivially small. Pages that previously relied on the layout’s `<main>` had their `<main>` wrappers added with `flex flex-col gap-9` so the previously inherited gap spacing is preserved — visual rendering unchanged.

**Alternatives considered:**

- *Wrap the conversation column in a contained card with bg-card / border / shadow.* Rejected — diverges from the cutting-edge convention (Claude.ai / ChatGPT / Cursor use no wrapping container); would have signaled “old-style enterprise chatbot panel” rather than modern AI surface.
- *Strengthen the top boundary with a thicker border (2px) instead of stronger token + breathing room.* Rejected — borders alone feel heavyset; stronger 1px hairline plus deliberate space reads as a higher-fidelity threshold.
- *Composer gradient-fade approach (Step B planning option B3, Claude.ai’s pattern).* Rejected for scope — directional shadow + tighter spacing (B1 + B2) is the more conservative cutting-edge convention (matches ChatGPT); the gradient-fade option can land as a polish session later if the directional-shadow treatment proves insufficient.
- *Reduce empty visual frame via width changes (Step B planning option C — reduce workspace padding or widen the chat column).* Rejected for this session — touches D-030’s architectural commitment (4xl wrapper + 3xl content). If A + B and empty-state elimination don’t fully resolve the perception, C is a focused follow-up session of its own.
- *Keep the empty state but make it complementary to the agent header (Step B planning option 3 — restructure both).* Rejected — adds UI surface area to solve a problem the cutting-edge convention solves by removing surface area. Less is more here.
- *Invert: keep the empty state but hide the header during empty state (Step B planning option 2).* Rejected — orphans the agent’s identity at the moment when orientation matters most, and produces a UI-shape change between empty state and active conversation that’s distracting.
- *Defer the double-`<main>` accessibility fix to a separate session.* Rejected — trivially small, structurally adjacent to the layout work in this session, free to do.

**Consequences:**

- The chat surface now reads as a coherent product surface. Top boundary signals “the chat starts here,” composer signals “this is the surface’s anchor,” empty middle signals “start typing.” Operator confirmed in browser smoke.
- The empty-state panel and its component file are gone. Any future need to show orientation content on a fresh agent (suggested prompts, recent activity, file gallery) would need to be a fresh design decision, not a reactivation of the old empty state.
- `agentUpdatedAt` is no longer plumbed through `ChatInterface` — it was only used by the deleted panel’s “Last updated” fact column. The page’s `agent_attachments` query still returns full rows but only `.length` is consumed downstream; a future cleanup could downgrade the query to a count-only fetch.
- The double-`<main>` violation is resolved. Each page now has exactly one `<main>` landmark. Pages that previously returned fragments (workspace landing, department detail) wrap in `<main>` with `flex flex-col gap-9` to preserve their visual spacing.
- D-030’s architectural commitments (4xl wrapper + 3xl content + `scrollbar-stable` + `-mr-[15px]` three-piece machinery) remain intact. Session 28 worked within them.
- The model and web-search chips on `AgentHeader` now render unconditionally. The earlier `emptyState` prop logic that hid them was infrastructure for avoiding duplication with the now-deleted empty-state panel; with the panel gone, the conditional has no purpose.

## D-045 — Per-user department access activation: real access model, org-level defaults, admin user-access surface, locked-but-visible UX

Date: 2026-05-12
Status: Accepted

**Context:** D-035 deferred per-user department gating to a future session, on the premise that the open-signup posture (every authenticated user lands on all 8 departments) was a deliberate Phase-2 demo rather than a load-bearing decision. Session 26’s audit established that the `user_department_roles` infrastructure was already in place — table + RLS (`udr_read_own`, `udr_admin_read_dept`, `udr_admin_write` from migration 0001) + the `has_department_access(dept_id)` SQL function + the `is_department_admin(dept_id)` companion. The UI layer was a demo overlay: a `LOCKED_DEPARTMENT_SLUGS = ["product", "compliance"] as const` constant on the workspace landing that locked two departments for everyone regardless of their actual `user_department_roles` rows.

Operator framing during Session 29 surfaced the real customer model: law firms and in-house legal departments onboarding associates. The access model needs to support gated access during ramp-up (“here’s what your firm uses; here’s what you’ll have access to after orientation”) plus an org-level defaults pattern that scales to a 50-attorney firm without manual per-user setup per new hire. The demo posture wasn’t compatible with that — every signup got everything, and there was no surface for an admin to express “by default, new associates get Commercial and General Tools.”

Step A research confirmed schema readiness: row presence in `user_department_roles` already drives `has_department_access()`, the `department_role` enum carries `('dept_admin', 'user')` where `'user'` is the plain-access value (no enum extension needed), and the seed grants `dept_admin` on every department only to the explicit admin email. The only schema gaps were the absence of an org-level defaults table and an RLS over-tightening from migration 0015 — `departments_read_accessible_or_admin` hid every inaccessible department from non-admin users, which blocked the locked-but-visible UX outright (the user can’t see what they don’t have access to).

**Decision:**

*Activate per-user access end-to-end.* `LOCKED_DEPARTMENT_SLUGS` retired from `app/workspace/page.tsx`. The launchpad grid and the workspace rail now drive locked-vs-accessible state from real `user_department_roles` data via a new helper `getAllDepartmentsWithAccess(userId)` in `lib/auth/access.ts`. The helper returns `DepartmentWithAccess[]` — base shape extending `AccessibleDepartment` with a `hasAccess: boolean` field — so narrower-typed consumers (workspace top bar, breadcrumb) accept the richer shape via structural assignment.

*Locked-but-visible UX, not hidden.* Both the workspace landing grid and the rail show every department in the org, with inaccessible ones rendered in their existing locked variant: muted card / muted rail row, lock icon, “Request access” mailto link scoped to the department’s name and pointing at `siteConfig.adminEmail`. The card variant was preserved verbatim from the Phase-2 demo (`LockedDepartmentCard` in `department-card.tsx`); the rail’s locked-row variant is new in `workspace-rail.tsx`. Mirrors Notion / Linear / Slack convention: users see what their org has even when they can’t enter it yet, with a natural “ask for access” pathway.

*Org-level admin-configurable defaults.* New table `public.organization_default_departments` (migration 0020) records the set of departments auto-granted to a new user at first provisioning. Org-admin write-gated (`organization_default_departments_org_admin_write`), open-read inside the org (`organization_default_departments_read_same_org`). Backfilled with `commercial` + `general-tools` as the canonical defaults for the existing org via a generic slug-keyed insert. `ensure_user_provisioned()` (migration 0021) extended via `CREATE OR REPLACE` with a Stage 2 tail block: when the caller has zero existing `user_department_roles` rows, insert one row per default with `role = 'user'`, guarded by `ON CONFLICT (user_id, department_id) DO NOTHING` against the existing unique constraint and wrapped in an `EXCEPTION WHEN OTHERS` block matching the function’s prior best-effort error-swallowing posture. Defaults apply once at first provisioning, not on every authenticated request — any existing grant (manual, defaults-applied, or seed-inserted) blocks Stage 2 from re-running.

*RLS relaxation on `public.departments`.* Migration 0020 §3 drops `departments_read_accessible_or_admin` (from migration 0015) and replaces it with `departments_read_same_org`. Every org member can now read every department row’s `id`, `slug`, `name`, `description`. The agents inside each department remain RLS-gated via `agents_read_accessible` (uses `has_department_access(department_id)`) — content is gated, structure is not. The 0015 tighter policy was prophylactic, not load-bearing for the customer model: department metadata isn’t sensitive on its own, and the locked-but-visible UX requires every member to read every department’s name to render the locked card / rail entry.

*New admin User access surface at `/workspace/admin/users`.* Two sections on one page. Top section: “Default access for new users” — chip toggles over the full department list, controlled by `addDefaultDepartmentAction` / `removeDefaultDepartmentAction`. Main section: per-user access matrix — every user in the org as an expandable row (chevron disclosure), each user’s row revealing a chip-toggle group of the same department list controlled by `grantDepartmentAccessAction` / `revokeDepartmentAccessAction`. Page-level gate is `isCurrentUserOrgAdmin()` → `notFound()` (tighter than `admin/layout.tsx`’s `requireAdminUser()` which admits any `dept_admin`); user-access management is org-level work. Four parallel server reads at page load: full departments list, org users, current defaults, all `user_department_roles` rows bucketed by user. Plain `Record<user_id, department_id[]>` shape across the RSC boundary (Set/Map don’t serialize).

*Chip toggle vocabulary.* Aperture slate-blue filled chips (`bg-chat-cite-bg` + `text-primary`, matching the Department Agent / Web search chip vocabulary from Session 27) with a leading `Check` icon for the granted / default state. Muted outlined chips (`border border-border` + `bg-card` + `text-muted-foreground`) with a leading `Plus` icon for the click-to-grant / click-to-add state. Inline legend above each chip group: instructional sentence (“Click a department to toggle access.” / “Click a department to toggle whether it’s a default for new users.”) followed by two color-dot indicators with explicit labels (“Granted” / “Click to grant”; “Currently a default” / “Click to add as default”). The legend + icons were added in a polish pass during Session 29 smoke testing when the operator surfaced state-ambiguity in the initial color-only design.

*Server actions in `lib/actions/admin-users.ts` (new).* Four exports: `grantDepartmentAccessAction`, `revokeDepartmentAccessAction`, `addDefaultDepartmentAction`, `removeDefaultDepartmentAction`. Centralized `gateOrgAdmin()` helper composes `getUser` + `isCurrentUserOrgAdmin` + organization-id resolution; centralized `verifySameOrg()` confirms the target user and target department both belong to the caller’s organization as defense-in-depth (RLS would reject cross-org writes, but the explicit check returns a clean validation error). Zod-validated inputs, discriminated-union `{ ok: true } | { ok: false; error: string }` return, PG-error-code-only logging on failure (no PII per `backend-security.md`). Grant + revoke also call `revalidatePath('/workspace')` so the user’s rail and landing reflect the change on their next request.

*Mailto request-access pattern preserved.* Locked cards (`LockedDepartmentCard` in `department-card.tsx`) and locked rail rows (new render branch in `workspace-rail.tsx`) both build a department-scoped `mailto:` link to `siteConfig.adminEmail`. Two call sites of inline mailto-construction — judgment call to inline rather than extract a shared helper, near the duplication threshold but not over it.

**Reasoning:** The schema was already designed for this. The work was activation, not architecture. Row presence in `user_department_roles` as the access mechanism (versus a separate access boolean) keeps the model simple: grant = INSERT, revoke = DELETE, idempotent at the unique constraint. The `'user'` value in `department_role` is the plain-access role; no enum extension required.

Locked-but-visible chosen over hidden for two reasons. First, cutting-edge AI-native products converge on this pattern (Notion / Linear / Slack all show locked-but-visible structure with a request-access pathway). Second, the customer model demands it: hiding inaccessible departments makes the firm’s tooling invisible to onboarding associates and breaks the “request access” mental model — you can’t ask for what you can’t see. The 0015 prophylactic gating was honest at the time it was added (Session 20’s stranger-protection posture) but doesn’t survive the customer model.

Org-level defaults chosen over no-defaults (force admins to grant per user explicitly) because the alternative breaks at scale. A law firm onboarding 5 associates per month would otherwise need to manually grant 5 × N departments per month. Defaults express “what we are by default” and admins layer exceptions on top. The defaults-apply-once-at-first-provisioning semantic is critical for stability: without it, an admin’s revoke would silently be undone the next time the user signed in. The zero-grants gate on Stage 2 preserves admin intent — any existing grant (manual or previously-defaulted) blocks further automatic defaults.

The chip clarity polish (icons + inline legend) deferred to mid-session because the initial implementation was theme-consistent and aria-correct (`aria-pressed` on the buttons, `role="group"` on the chip rows), but the operator’s smoke surfaced that color-alone differentiation isn’t enough for users who don’t read color as semantic state. The `Check` / `Plus` icons plus the legend match modern toggleable-chip convention (GitHub topic chips, Linear labels, Notion tags) and resolve the ambiguity without changing the underlying interaction. WCAG 1.4.1 (“don’t rely on color alone”) was effectively the trigger.

**Alternatives considered:**

- *Hide inaccessible departments from launchpad and rail (the simpler “you only see what you have” pattern).* Rejected — breaks the customer model where associates need to see what the firm has even before they have access; conflicts with the request-access pathway that depends on visible structure.
- *No org defaults — admins grant per user explicitly.* Rejected — doesn’t scale beyond very small customer cohorts; every new associate would require a manual grant per department.
- *Hardcode defaults in the seed file, no admin configurability.* Rejected — encodes a product decision in the database that should be customer-controlled; an org that decides “we want Privacy as a default too” would need a new migration rather than a UI toggle.
- *Per-department admin UI (manage access from each department’s card).* Rejected — per-user view matches how the work actually happens during onboarding (“grant Sarah what she needs”). Per-department view is useful for audits but as a primary surface adds clicks for the common case.
- *Matrix view (grid of users × departments with toggles at each intersection).* Rejected — intellectually clean but visually heavy and hard to scan past ~10 users. Per-user expandable rows scale better and match the inline-disclosure pattern D-041 established.
- *Modal-based per-user access editing.* Rejected — D-041’s direct-manipulation precedent works at this scale; modals add ceremony without earning their place.
- *Keep migration 0015’s `departments_read_accessible_or_admin` RLS policy and route locked-card metadata through a security-definer RPC.* Rejected — adds plumbing for prophylactic gating that doesn’t earn its place; the simpler `same_org` policy is honest about what’s gated (agent content) versus what’s visible (department structure).
- *Color-only chip state differentiation (the initial Session 29 implementation, pre-polish).* Rejected after operator smoke surfaced ambiguity — `Check` / `Plus` icons + inline legend added for clarity. WCAG 1.4.1 grounding made the change non-optional once flagged.

**Consequences:**

- `LOCKED_DEPARTMENT_SLUGS` is gone. Future “locked” treatment on departments is driven by real access data, not constants. If a future product decision wants to lock departments at the build level (e.g., “Coming soon” placeholders), that needs a separate mechanism — flagged but not anticipated.
- `organization_default_departments` is a new persistent table that org-admins manage via the new UI. Future features that need org-level configuration (default agent templates, default knowledge sources, default integrations) should follow the same pattern: dedicated table, org-admin-write RLS, admin UI section.
- `ensure_user_provisioned` is now two-stage (users row creation, then defaults grants). Any future modification must preserve both stages and the zero-grants gate on Stage 2. The function’s best-effort `EXCEPTION WHEN OTHERS` block on the defaults INSERT means provisioning failures don’t block requests; admin-recoverable via the new UI if a defaults insert ever fails.
- The `departments` SELECT policy is now permissive at the row level (`same_org`). Any future change that needs to hide departments per-user would need to revert or extend this — flagged for future awareness. The agent-content RLS (`agents_read_accessible` + `has_department_access`) remains the access enforcement boundary; relaxing the structure-level policy did not weaken it.
- D-035’s open-signup posture is effectively retired. The system no longer assumes every authenticated user has full department access; access is data-driven and admin-managed. The invitation gate (D-035’s other deferred posture) remains separate and unimplemented — closing the gate-on-signup posture is independent of who-can-do-what-once-signed-in.
- The chip-toggle pattern (slate-blue filled with `Check` vs. outlined with `Plus`, inline legend with color-dot indicators, optimistic `useTransition` + `toast.error` revert) is now the project convention for any future binary admin toggle. Future admin surfaces (feature flags, role promotion, etc.) should match.
- D-041’s mirror-RLS-exactly principle continues to evolve in the same direction D-042 established: Session 29’s `getOrgUsers`, `getAllUserDepartmentRoles`, `getOrganizationDefaults`, and the four admin actions all gate on org-admin even though RLS would admit `dept_admin` in some cases. Org-level admin operations stay org-admin only. The pattern: app-layer gates tighter than RLS when the product policy is “this is org-level work.”
- The mailto request-access pattern (department-scoped subject + body, pointing at `siteConfig.adminEmail`) is now duplicated across two render call sites — the locked card and the locked rail entry. Acceptable at two; if a third call site appears, extract a `buildDepartmentRequestAccessHref(name)` helper.

## D-046 — Admin nav surface: dual-rail mode, grouped landing, Title Case for tool labels

Date: 2026-05-12
Status: Accepted

**Context:**

The admin surface in Session 23 shipped as three flat cards on `/workspace/admin`, navigated to via a single “Admin” item in the workspace rail’s profile dropdown. With more admin tools planned (invitation gate, agent admin UI, evals, cost dashboards) the flat-cards approach was about to stop scaling — both the landing and the rail entry needed structure. Two coupled questions surfaced: how should the chrome express that the user is in an administrative mode rather than the daily-driver workspace, and how should the admin tools be organized once there are more than three of them.

**Decision:**

Three coordinated changes ship as one commit (43f3733):

1. **Dual-rail mode.** The left rail is now pathname-aware. On `/workspace/admin/*` routes it renders as `AdminRail` (a sibling component to `WorkspaceRail`) with an “Admin” top-line link and three captioned groups — Access, Insights, Value. Off admin routes it renders the existing `WorkspaceRail` unchanged. The switch happens client-side via a thin `RailSwitcher` component that takes both server-rendered rails as `ReactNode` props and picks one based on `usePathname()`. Brand mark in both rails routes to `/workspace`, serving as a universal home gesture.

2. **Entry and exit via the avatar menu.** The existing `WorkspaceProfileBlock` dropdown’s “Admin” item now flips label and href contextually — “Admin” → `/workspace/admin` from workspace pages, “Back to workspace” → `/workspace` from admin pages. The menu always shows the destination, not the current location. The `isAdmin` prop gating is unchanged; non-admins still see no entry.

3. **Grouped landing + source-of-truth array.** `/workspace/admin` retained as a cards-grid landing page (rather than redirecting to the first admin tool) so admins always land somewhere predictable on entry. Cards are now grouped by Access / Insights / Value with section headers matching the rail. A single `ADMIN_NAV_GROUPS` array in `lib/admin/nav.ts` is the source of truth — both the rail and the landing consume it; adding a new admin tool is a one-line append. The `← Admin` back-links on the three admin sub-pages were removed since the rail provides the same affordance globally.

A follow-up tweak in the same commit normalized admin tool labels to Title Case (“User Access”, “Adoption Metrics”, “Productivity Calculator”) across rail, card titles, breadcrumb leaves, and page h1s — deviating from the UX-writing skill’s sentence-case rule. The breadcrumb was also reworked: every non-last segment that resolves to a real route now renders as a `<Link>` (via a new `STATIC_SEGMENT_HREFS` map + `resolveSegmentHref` helper); scoping segments with no route (currently just “Departments”) render as plain spans.

**Reasoning:**

The dual-rail pattern matches admins’ actual mental model — entering Admin is entering a different mode of the application, not navigating to a deeper page. Mirroring the rail grammar (one top-line link + N captioned groups) in admin mode keeps the visual language consistent across modes while making clear which mode the user is in. The Linear and Vercel admin surfaces both work this way.

Keeping `/workspace/admin` as a cards landing rather than redirecting to the first tool earns its keep two ways: (a) admins entering the section always land on a predictable surface regardless of where they were last, and (b) the landing leaves room to grow into a glanceable dashboard with live metrics per card (deferred to README Future / Backlog). The strict-mirror landing now is intentionally a redundant second index of the same items; that’s acceptable as a staging point because both surfaces share a source-of-truth array and cannot drift.

The avatar-menu trigger was chosen over a persistent top-bar switcher because admin mode is bursty — users enter, do a thing, leave. A permanent chrome affordance for a rare action wastes top-bar real estate; the contextual menu entry hides naturally for non-admins and stays out of the way for admins not currently switching. The label-flip (“Admin” ↔ “Back to workspace”) makes the menu’s contents an honest signal of intent.

Title Case for admin tool labels is a scoped deviation from the UX-writing skill’s sentence-case rule. The reasoning: the Workspace rail’s department items are proper nouns (“Commercial”, “Litigation”) and naturally render Title Case. Sentence case on admin tool labels creates visual disparity between the two rails. Title Case throughout puts both rails on the same typographic footing. The deviation is scoped to admin tool names; the rest of the app continues to follow sentence case per the skill.

**Alternatives considered:**

- **Rejected — Flat nav with no categories.** Three items don’t need categories today and category headers for single-item groups read as scaffolding the product hasn’t grown into. Operator chose categorized nav anticipating growth and for visual consistency with the Workspace rail.

- **Rejected — Admin lives at a top-level URL like `/admin`.** Would have required threading a parallel layout system; nesting under `/workspace/admin/*` reuses the existing workspace chrome’s auth gates, top bar, and route group with no duplication. The mental model (Admin is a mode of Workspace, not a separate app) matches the actual data model — admin users are users with extra capabilities, not a separate principal.

- **Rejected — Persistent top-bar mode switcher (W | Admin segmented control).** More discoverable for first-time admins but wastes top-bar real estate for a rarely-used action. Discoverability can be solved later with onboarding nudges if it becomes a real problem.

- **Rejected — Last-visited admin page on entry.** Routing `/admin` to wherever the user last was inside admin felt user-friendly in the abstract but makes the entry behavior unpredictable — same click, different destination depending on hidden state. Always-land-on-`/workspace/admin` is the better fit for a surface admins visit, not live in.

- **Rejected — Strict sentence case across the board.** The UX-writing skill’s default rule; would have kept admin labels as “User access” / “Adoption metrics” / “Productivity calculator”. Operator chose Title Case for visual parity with department names. Skill rule still holds elsewhere.

- **Rejected — Enriched dashboard cards on the landing now.** Surfacing live metrics per card (seat count, recent activity, latest computed value) is the long-term direction but bundles a separate design problem into a nav refactor. Deferred to README Future / Backlog.

**Consequences:**

The `ADMIN_NAV_GROUPS` source-of-truth array becomes the canonical extension point for new admin tools. Adding a tool: one entry in `lib/admin/nav.ts`, both the rail and the landing pick it up automatically; the breadcrumb needs an `STATIC_SEGMENT_HREFS` entry + a `ROUTE_TABLE` row.

The `STATIC_SEGMENT_HREFS` map in `workspace-breadcrumb.tsx` now has to be kept in sync with admin route additions. Future maintenance cost is small (one entry per tool); worth flagging because it’s a second place the new-admin-tool checklist needs to touch.

Title Case on admin tool labels means future admin-section additions should follow the same pattern for internal consistency. Other parts of the app continue to follow the skill’s sentence-case rule. The CLAUDE.md skill-routing should eventually note this scoped exception.

Agent-name resolution in `resolveSegmentHref` matches by name string (`agents.find((a) => a.name === seg)`) and returns the first match. Collision risk if two agents share a name; tighten to id-keyed resolution if collisions surface. Accepted at current cohort scale.

## D-047 — Workspace rail expanded to four product domains; dashboard transition attempted and reverted

Date: 2026-05-13
Status: Accepted

**Context:**

After Session 30 shipped the admin nav revamp, the operator turned attention to the Workspace rail and surface architecture. The pre-Session-31 rail carried three coming-soon entries (Knowledge / Matters / Resources) below the Departments group — placeholder categories that hadn’t yet been built and had no committed product shape. With more product surfaces planned (workflows for legal task orchestration, integrations for connecting CLMs and DMS via MCP, a help surface for documentation), the three placeholders no longer represented the product’s actual direction. Separately, the operator raised whether `/workspace` itself should be promoted from a department launcher to a cards-grid dashboard surfacing the product’s full set of domains.

**Decision:**

Session 31 ships as commit 5947326 with two coordinated outcomes:

1. **Rail restructured around four product domains, each with multiple sub-leaves.** The RESOURCE_GROUPS array in `components/workspace/workspace-rail.tsx` was replaced. New shape: Knowledge (Research / Vault / Sources, all coming-soon pending Session 32’s reshape), Workflows (My Workflows + Template Library), Integrations (Connections + Marketplace), Help (Guides + What’s New). The first leaf in each non-Knowledge group routes to a real placeholder page; second leaves and all Knowledge leaves fall back to coming-soon URLs. Three new placeholder pages shipped at `/workspace/workflows`, `/workspace/integrations`, `/workspace/help` — each a real designed page describing what the surface will become, not a generic coming-soon component. Five new coming-soon area entries (knowledge-vault, knowledge-sources, workflows-templates, integrations-marketplace, help-whats-new) for the sub-leaves that don’t yet have real routes.

2. **Breadcrumb renders visually lowercase via CSS text-transform.** The outer breadcrumb container received a `lowercase` class so every visible segment renders lowercase, while the underlying segment data (ROUTE_TABLE strings, STATIC_SEGMENT_HREFS keys) preserves natural case. The breadcrumb labels for the five new sub-leaves were added to RESOURCE_AREA_LABELS so they render as polished labels (“template library”, “what’s new”) rather than raw hyphenated slugs.

Naming calls that landed in the same commit: rail leaf labels follow Title Case across all groups (matching the Session 30 deviation for admin tool names — single typographic convention now applies to all nav items). “All Workflows” renamed to “My Workflows” to honestly name what the list contains (workflows the user/org authored, not all workflows in the world).

**Reasoning:**

The four-category structure (Knowledge / Workflows / Integrations / Help) emerged from a brainstorm grounded in how mature legal AI products organize their feature surfaces. Legora ships Workflows as an orchestration layer composing native tools; legal research products treat content partnerships (EDGAR, Westlaw, regional case law) as a distinct surface from operational integrations (CLMs, DMS); every mature help surface in premium products splits structured docs from changelog/release-notes. The taxonomy reflects those patterns rather than inventing a new vocabulary.

Knowledge specifically was reshaped from a single-leaf placeholder into a three-leaf architecture (Research / Vault / Sources) to encode the operator’s vision for the surface as a research domain with three sources (firm internal corpus, open web, trusted legal content partnerships) backed by an admin-configurable Sources surface for content integrations. The rail expresses that intended shape now even though the destinations are still coming-soon — the rail is a navigation contract that should reflect the product’s planned structure, not just what’s currently built. Session 32 will build out Knowledge’s real routes; the rail entries already exist for them to land into.

The breadcrumb lowercase decision reversed Session 30’s “match the rail’s Title Case” choice. Session 30 optimized for visual consistency between rail and breadcrumb; the lived experience showed Title Case breadcrumbs compete with page h1s (also Title Case) for typographic attention. Lowercase breadcrumbs read as ambient chrome — the URL-bar mental model — and let h1s carry the page’s voice. Linear, Vercel, Notion, GitHub all use lowercase or sentence-case breadcrumbs for the same reason. Implementation via `text-transform: lowercase` on the outer container preserves segment data in its natural case (department names like “Commercial” stay “Commercial” in the DOM tree; only the visible rendering is lowercase) so the data model stays honest.

Sub-leaf names were chosen against industry patterns: “My Workflows” + “Template Library” matches Zapier/n8n/Linear automations; “Connections” + “Marketplace” matches Stripe Apps/Vercel Integrations/Notion Integrations; “Guides” + “What’s New” matches Linear/Vercel/Stripe docs+changelog. Each pairing solves a real product job (cold-start for workflows, discovery for integrations, engagement for help).

**Alternatives considered:**

- **Rejected — Promoted `/workspace` to a five-category cards-grid dashboard.** Attempted mid-session. Built a `WorkspaceDashboard` component reading from `lib/workspace/dashboard.ts` (source-of-truth array mirroring the Session 30 admin pattern), with a stagger-children entrance animation. Browser pass showed the dashboard was a downgrade — five cards with Preview pills on four of five surfaces announced the product’s emptiness rather than its capabilities. The pre-Session-31 department-launcher hero was a stronger front door. Reverted by deleting the dashboard files from the working tree and restoring `app/workspace/page.tsx` and `components/workspace/workspace-modules.tsx` from git. `components/workspace/workspace-hero.tsx` was restored byte-for-byte from commit 49b8d1e (Session 21) via `git show 49b8d1e:components/workspace/workspace-hero.tsx >`. The dashboard concept moves to the roadmap for a future session when category surfaces have real content to surface.

- **Rejected — Workflows / Integrations / Help under a single umbrella category (“Ecosystem”).** Operator initially proposed this. Pushed back: workflows are user-authored sequences (verb), integrations are connection points to outside systems (noun), help is product documentation. Different jobs, different lifecycles. One umbrella forces a name that’s true to all three, which is how umbrella-categorized SaaS navs end up reading vague. Split into three peer categories instead.

- **Rejected — Monitors as a top-level category.** Considered surfacing regulatory monitoring as a fifth product domain peer to the others. Decided it’s a separate product (Legora ships it as a standalone product called Monitors with its own data model — subscriptions, feed items, triage state, audit trails). Added to README Future / Backlog instead.

- **Rejected — Strict-mirror dashboard cards (the staging pattern that worked for admin landing in Session 30).** Same approach: cards-grid as v1, enrich into dashboard tiles with live data later. Failed for `/workspace` because the admin landing’s small surface (three cards, all real working tools) tolerates being a thin index. The workspace landing’s five-card surface where four cards are placeholders fails the test — a thin index of “coming soon” reads worse than a substantive single-purpose surface.

- **Rejected — Real routes for all sub-leaves on day one.** Building placeholder pages for Vault, Sources, Template Library, Marketplace, What’s New (six pages total) would have shipped a thicker patch. Used coming-soon URLs instead so the rail navigation contract is in place while individual surfaces can land in future sessions without rail churn.

**Consequences:**

The rail’s `RESOURCE_GROUPS` data shape changed from a flat single-leaf-per-group array to a nested `RailGroup[]` where each group carries a `leaves: RailLeaf[]` array. Future rail additions follow this shape; adding a new sub-leaf is appending one entry to a group’s leaves array. The `RailLeaf.href` optional field is the extension point — leaves without an href fall back to coming-soon URLs automatically.

The breadcrumb’s natural-case data + visual-lowercase presentation split is now the canonical pattern for the breadcrumb. Future ROUTE_TABLE additions should preserve natural case in segment strings; the lowercase rendering is automatic. Session 30’s D-046 entry that documented Title Case breadcrumbs is now superseded by this entry on the specific question of breadcrumb case — the rest of D-046 stands.

The dashboard transition’s failure-and-revert pattern produced a process lesson worth carrying forward: when reverting a UI surface, restore from git literally (`git show <commit>:<file> > <file>`) rather than asking Claude Code to recreate the file from a description of what it used to look like. Interpretive recreation bakes in unintended changes from intermediate patches; literal restoration is byte-for-byte. This case: the hero file went through display-scale typography changes during the dashboard attempt; the “revert” via description recreated those typography changes around the pre-S31 copy. The literal restore from commit 49b8d1e fixed it. CHATBOT_HANDOFF.md should encode this rule.

Four planned future sessions inherit from this one: Session 32 wires Knowledge’s three sub-leaves to real routes (`/workspace/knowledge` with Research as default, plus `/vault` and `/sources` children); Session 33 builds the Workflows surface (My Workflows index + Template Library); Session 34 builds the Integrations surface (Connections list + Marketplace catalog); Session 35 builds Help (Guides v1 + What’s New changelog). The workspace dashboard concept is deferred to Session 36 or later, contingent on those four sessions shipping real content for the cards to surface.

## D-048 — Sub-leaf coming-soon template unified; Research routing fixed

Date: 2026-05-13
Status: Accepted

**Context:**

Session 31 shipped three top-level category surfaces (Workflows / Integrations / Help) as real routes from day one — `/workspace/workflows`, `/workspace/integrations`, `/workspace/help` — with custom placeholder page bodies (left-aligned h1 + subtitle + descriptive prose + an “In development — Session NN ships X” footer). The other sub-leaf surfaces under those categories (and under Knowledge) routed through the dynamic `/workspace/coming-soon/<area>` page, which rendered a different visual template — centered, mono-caps label, “Coming soon.” display headline, descriptive prose, “← Back to workspace” link. Two placeholder patterns doing the same job. Operator review surfaced the inconsistency on visual smoke; the centered template was preferred. Separately, the Research leaf under Knowledge routed to `/workspace/coming-soon/knowledge`, which rendered Knowledge-category content rather than Research-specific content — a leftover from Session 31’s scope decision to defer Knowledge’s reshape to Session 32.

**Decision:**

Single commit (3c1d9b0) unified the placeholder template across all nine sub-leaf surfaces and fixed Research routing:

1. **Extracted `ComingSoonContent` as a reusable component.** The centered visual template that the dynamic coming-soon route had been rendering inline was extracted into an exported component in `components/coming-soon/coming-soon.tsx`. Props: `{ label?: string; description: string }`. The original `ComingSoon({ area })` dispatcher now delegates to `ComingSoonContent` after looking up the area in `AREA_COPY`. The `copy` → `description` prop name change happens at the delegation boundary, leaving the `AREA_COPY` entry shape unchanged.

2. **Migrated three real-route placeholder pages to render `ComingSoonContent` inline.** `/workspace/workflows`, `/workspace/integrations`, `/workspace/help` page bodies replaced. Each now renders the centered template with its leaf-specific label (My Workflows / Connections / Guides — the first leaf under each category) and a description scoped to that leaf rather than the category as a whole. Page metadata titles updated to match the rail leaf labels.

3. **Fixed Research routing and content.** The rail’s Knowledge → Research leaf had `slug: "knowledge"`, falling back to `/workspace/coming-soon/knowledge`, which renders the Knowledge-category copy. Changed the slug to `knowledge-research` so Research routes to `/workspace/coming-soon/knowledge-research`. Added new entries to `AREA_COPY` (`knowledge-research` → Research-specific description covering the three-source research vision: internal corpus, open web, trusted legal content partnerships) and `RESOURCE_AREA_LABELS` (`knowledge-research` → “Research”) so the breadcrumb on the new URL renders as “workspace / research” rather than “workspace / knowledge-research”.

URL stability for the three top-level routes was preserved deliberately — when Sessions 33/34/35 ship real content for Workflows, Integrations, and Help, the URLs (`/workspace/workflows`, `/workspace/integrations`, `/workspace/help`) cut over to real content without URL churn. The placeholder template renders inline at those URLs in the meantime.

**Reasoning:**

Two placeholder templates were drifting independently. Each new sub-leaf added in Session 31 (Vault / Sources / Template Library / Marketplace / What’s New) followed the centered coming-soon pattern, while the Session 31 top-level category page (Workflows / Integrations / Help) followed the left-aligned custom-page pattern. The patterns diverged because Session 31 made two scope decisions in the same commit — real routes for top-level categories (URL stability), coming-soon URLs for sub-leaves (lighter weight) — without unifying their visual treatment. Operator visual review correctly read this as inconsistency; the unified centered template is the right v1.

The centered template is also more honest about what these pages are. A left-aligned page with h1 + descriptive prose + roadmap footer reads as a real product page that happens to be empty. A centered “Coming soon” page reads as a deliberate placeholder. The latter sets the right expectation for the user — these aren’t half-built surfaces, they’re surfaces where the URL exists but the content lives in the future.

Mapping the top-level URLs to their first-leaf content (My Workflows under `/workspace/workflows`, Connections under `/workspace/integrations`, Guides under `/workspace/help`) follows from the rail’s structure: each category has a caption (mono-caps WORKFLOWS / INTEGRATIONS / HELP) but the leaves below it carry the actual destinations. The first leaf under each category is the natural landing surface for that category’s URL. When the real surfaces ship, `/workspace/workflows` becomes the “My Workflows” index page; this commit just renders the right placeholder content at that URL now.

The Research routing fix closes a small but real broken-window issue. Every other leaf in the rail (eight total after this commit) routes to a leaf-specific coming-soon page with leaf-specific content. Research alone was routing to category-level content because its slug shared with the Knowledge-category fallback. The fix gives Research its own slug, content, and breadcrumb label — consistent with the pattern across all other leaves.

**Alternatives considered:**

- **Rejected — Consolidate all coming-soon URLs through the dynamic `/coming-soon/<slug>` route.** Would unify routing as well as visual treatment, but would force the three top-level URLs (`/workspace/workflows` etc.) to change to `/workspace/coming-soon/<slug>` form. When real content ships in Sessions 33–35, the URLs would have to change back to the canonical form — URL churn that breaks any bookmarks, deep links, or muscle memory built up against the temporary URLs. The chosen approach renders the same visual template at the canonical URLs with no URL change ever.

- **Rejected — Keep two placeholder patterns and pick which one fits each surface case-by-case.** Pragmatically defensible (different patterns for different surface lifecycle stages), but produces exactly the visual inconsistency the operator flagged. The unified template is a smaller and clearer pattern.

- **Rejected — Add a real `/workspace/coming-soon/knowledge-research` route file.** Considered briefly. Unnecessary: the dynamic `/workspace/coming-soon/[area]/page.tsx` route handles any area key registered in `AREA_COPY`. Adding the matching entries to `AREA_COPY` and `RESOURCE_AREA_LABELS` is sufficient; no new route file needed.

**Consequences:**

`ComingSoonContent` is now the canonical placeholder component for any future sub-leaf or category-level surface that ships in a planning state before its real content lands. Future placeholder pages reuse it directly. The `ComingSoon` dispatcher remains for slug-driven content lookups; the two compose cleanly.

Adding a new placeholder sub-leaf now takes two entries (one in `AREA_COPY`, one in `RESOURCE_AREA_LABELS`) plus a rail leaf with the slug — no new component, no JSX duplication. Adding a new category-level URL that needs to render a placeholder takes one new page file that imports `ComingSoonContent` and passes the appropriate label and description; the route is then ready to receive real content via in-place page-body replacement when the real surface ships.

The three top-level placeholder routes (`/workspace/workflows`, `/workspace/integrations`, `/workspace/help`) now describe the first-leaf surface, which means when real content ships, the page-body content will already match the URL’s intent — the cutover is replacing placeholder JSX with real JSX, not also renaming the page’s mental model.

## D-049 — Demo access via per-session isolated workspaces with synthetic emails

Date: 2026-05-13
Status: Accepted (deferred implementation)

**Context:**

The operator wants to distribute view/interaction access to a “small select few” trusted people without collecting their real email addresses — primarily because the platform’s privacy posture (terms of service, GDPR-compliant data flows, consent mechanisms) isn’t yet production-ready, and exposing real user emails to a system that hasn’t completed privacy review feels premature. The need is real today (demo distribution would unblock product feedback and informal user testing), but the implementation effort is real too, and operator wants this logged and scoped now even though the build is deferred. See `docs/DEMO_ACCESS_SCOPING.md` for the build plan.

**Decision:**

Demo access ships as **per-session isolated demo workspaces** distributed via single-use invitation tokens. The technical pattern:

1. Operator generates a high-entropy invitation token via an admin UI; hands the URL (`legalos.com/demo/invite/<token>`) to the demo user via trusted channels (Signal, text, in-person). No email round-trip.
2. Demo user clicks the URL. The route uses Supabase’s admin API (`supabase.auth.admin.createUser`) to create a fresh user with a synthetic email (`demo-<uuid>@legalos-internal.invalid`, where `.invalid` is the RFC 2606 reserved unroutable TLD). The user is real to Supabase and works with all existing RLS, role, and access infrastructure.
3. A new organization with `is_demo: true` is provisioned for the demo user; seed data (4-5 realistic departments, 8-10 agents across departments, 3-5 sample conversations per agent) is duplicated into the new org via a `seedDemoOrg(orgId)` function.
4. Server-issued session cookie via `admin.generateLink` consumed server-side. Demo user lands on `/workspace` with their own isolated copy of the seed.
5. A daily cleanup job (Vercel cron) deletes demo users + their data 7 days after creation; expired/consumed invitation tokens cleaned up on the same schedule.

Each demo user has their own isolated org and data. Actions taken in one demo session don’t affect another demo user. The operator’s real org is fully separate.

**Reasoning:**

The constraint shaping this decision was the operator’s stated requirement of “no real email collected” combined with the goal of “give them a real feel for the product.” Several auth patterns were considered (see Alternatives); per-session isolated workspaces is the only pattern that satisfies both constraints without compromising either.

Per-session isolation (rather than shared demo accounts) was chosen because demo users will likely overlap in time, and seeing each other’s edits would feel weird (“who added that agent?”). It also means demo users can experiment freely — break things, delete things, create things — without affecting other demo users or accumulating cruft for the operator to clean up manually.

The 7-day TTL was chosen as the balance between “demo users have enough time to socialize the product with colleagues” (vs. session-bounded TTL where they can’t return tomorrow) and “data accumulation doesn’t get out of hand” (vs. 30-day TTL where demo orgs pile up). 7 days lets a demo user explore on day 1, share with one colleague on day 3, and revisit on day 7 without expiration pressure.

The realistic-fidelity seed data (vs. minimal) was chosen because demos sell the product. A workspace with 2 departments and 3 agents tells the visitor “this is a thin tech demo”; a workspace with a realistic legal team’s structure tells them “this is a real product I could use tomorrow.” The maintenance cost is real but bounded — the seed lives in one file (`lib/demo/seed.ts`) and is updated when new agent types ship, which is a few times per year.

The synthetic email domain (`@legalos-internal.invalid`) was chosen because `.invalid` is reserved by RFC 2606 specifically for cases like this — guaranteed unroutable, no possible collision with real users, semantically signals “this is not a real address.” Alternative approaches (UUIDs as emails, NULL emails) would either look like garbage in admin views or break Supabase Auth’s email-required schema assumption.

The deferred implementation is deliberate — the feature is real and worth building, but it’s not blocking any current work, and the operator wants the privacy posture properly thought through before activating the demo path. The scoping doc + this decision entry are the artifacts that make the future build session efficient.

**Alternatives considered:**

- **Rejected — Shared demo accounts.** One or a small pool of pre-provisioned accounts (Demo-Alice, Demo-Bob, Demo-Charlie) that demo users sign in as. Simpler to set up, but demo users see each other’s actions and accumulated edits, which is a worse demo experience. Also means manually re-seeding the shared accounts whenever they drift from the desired state.

- **Rejected — Static demo screens at `/demo`.** A parallel set of hard-coded pages with sample content, no auth, no database. Lowest engineering effort and zero security surface, but it’s a marketing artifact rather than the real product. Demo users can’t experience interactivity (chat with agents, see real navigation, etc.). Drift becomes a constant tax as the real product evolves and the demo screens don’t.

- **Rejected — Real read-only role enforced via RLS.** Add a `viewer` role and update every server action and RLS policy to reject writes. Most realistic demo experience (real data, real auth, real state), but enormous engineering surface (touches every write path), and the UX becomes weird (visible forms that don’t submit, clickable buttons that do nothing).

- **Rejected — Adopt a third-party auth service (Stytch, Clerk, Auth0) with built-in guest/passwordless modes.** Overkill for the use case. Adds a vendor dependency and an architectural change to solve a problem that fits cleanly inside existing Supabase patterns.

- **Rejected — Just use real emails with a “this is alpha” disclaimer.** The operator’s privacy posture isn’t ready, and collecting real emails creates a real data inventory that future privacy work would need to address. Easier to never collect than to delete later.

**Consequences:**

The implementation is architecturally additive — no changes to existing auth, RLS, role model, or any current code paths. The new code lives entirely in:

- New routes (`/demo/invite/[token]`, `/workspace/admin/demo-invitations`)
- New tables (`demo_invitations`, `is_demo` column on `organizations`)
- New seed data module (`lib/demo/seed.ts`)
- New cleanup cron job (`/api/cron/cleanup-demo`)

This means iteration speed on the rest of the product is unaffected while the feature is deferred, and the feature can be built without restructuring anything existing when it’s prioritized.

Demo users see live UI changes as the operator ships them — same routes, same components, same code paths as real users. The only data difference is `organization_id` scoping, which RLS already enforces. The seed data needs manual updates as new agent types ship (small recurring tax).

The same admin-API-creates-user pattern used here is a prototype for the future invitation gate that will sunset D-035 (the temporary public-signup window). When that gate ships, the demo path’s user-creation flow becomes a reference for the real invitation flow — single-use tokens, server-side user creation, no email round-trip. Likely a 1-session refactor at that point rather than a from-scratch build.

The security guardrails (token entropy, single-use, rate limiting, synthetic email domain lock) are critical — the demo route is effectively a “create authenticated user” endpoint, and any weakness lets adversarial users spin up unlimited accounts. The scoping doc captures the specific implementation requirements; the build session should treat the security section as non-negotiable.

## D-050 — Dual-delight standard for product and maintainer experience

Date: 2026-05-24
Status: Accepted

**Context:**

Across Sessions 8a–31, legalOS shipped a substantial product surface — three-tier agent architecture, 13 departments organized into four product clusters, the hybrid-edit pattern, soft-delete with 30-day undo, the workspace shell, and an admin foundation. The work was productive but also surfaced a pattern: small, locally-reasonable choices kept accumulating into structures that were harder to maintain than they needed to be. Shortcuts that “worked for now” became load-bearing in ways that compounded over time.

By the start of the polish phase, the cost of inconsistencies — between similar surfaces, between docs and reality, between admin and non-admin paths, between Canonical and C4L agent flows — was becoming the dominant friction. Future engineers reading the code would pay a per-inconsistency tax forever. The polish phase needed a unifying standard to decide what was worth fixing, what was worth dropping, and how to make decisions that wouldn’t compound the same way.

**Decision:**

Every product and architectural decision in legalOS must delight both end-users AND maintainers. Neither audience is privileged over the other. If a change improves the user experience but introduces an inconsistency that costs future engineers, it doesn’t ship in that form — find an alternative that’s good for both, or defer until one exists.

Concretely, the standard requires:

- **Build for the long term, no shortcuts.** Fixes that work today but break the next time someone touches the area are net-negative. Time pressure is not a reason to ship something the next engineer will have to undo.
- **Consistency over local cleverness.** When a similar problem has already been solved elsewhere in the codebase, the new solution should match — not invent a parallel pattern just because it’s slightly tidier in isolation.
- **Documentation is product.** The doc that bootstraps the next chat session, the doc a new engineer reads first, the migration that explains itself in its header — these are user-facing surfaces in the same way as the product UI is. Stale or misleading documentation is a bug.
- **Don’t fix what isn’t broken.** Pre-emptive solutions to imagined problems are forbidden. If a change has no observable benefit today and the cost is real, the right answer is to skip it and document why.
- **Decide explicitly.** When a polish item or feature request turns out not to need code, the decision itself — with reasoning and trigger conditions for revisiting — is the polish outcome. Recording “we chose not to do this, and here’s why” is as valuable as shipping the alternative.

**Reasoning:**

The principle emerged across the polish phase as the clarifying frame for decisions that would otherwise have gone in multiple directions:

- Polish #2 (card affordance consistency) chose tightening one inconsistent affordance over inventing a new pattern, because the existing pattern was good enough and parity reduced cognitive load.
- Polish #5 (sort_order gaps) was dropped entirely after investigation revealed the gaps were invisible to users and any normalization would be undone by the next C4L re-import. The “fix” would have introduced complexity for zero benefit.
- Polish #6 (deferred-skills doc reorder) was dropped because the existing order read fine and reordering would generate commit churn on a heavily-edited file.
- Polish #8 (data/ directory concept review) closed by replacing speculation with verified evidence in the authoritative reference doc, rather than building infrastructure for empty placeholder directories.
- Polish #12 (C4L agent fork behavior) closed by verifying that the current behavior was intentional and correct — plus a one-line latent-bug fix for `default_output_format` preservation that was found in passing.

In each case, the dual-delight standard provided the discipline to recognize that the right answer wasn’t “ship code” — it was “decide correctly and document the reasoning so future work doesn’t have to re-derive the same conclusion.”

The standard is named to make clear that neither audience can be sacrificed: a product change that delights users but creates a maintenance burden is rejected, just as a refactor that delights maintainers but degrades the user experience is rejected.

**Alternatives considered:**

- **Rejected — Optimize for shipping velocity alone.** Earlier in the project, decisions sometimes favored “what gets this working today” over “what’s the right shape long-term.” That trade-off was acceptable when the product surface was being prototyped, but is no longer acceptable once the surface is being polished for real users. Velocity-only optimization creates the exact accumulated-inconsistency problem the polish phase had to address.
- **Rejected — Optimize for user experience alone.** Standards focused exclusively on user-facing quality would have approved decisions like “ship the visible fix even if the code is awkward to maintain.” This creates compounding tech debt that eventually slows down everything, including the user-facing work.
- **Rejected — Document standards in CLAUDE.md only.** CLAUDE.md is read by every chat session; that’s the right place for operating principles to live. But the standard is also a decision the project has made about how it operates — and the DECISION_LOG is where decisions about the project itself belong. Both locations carry it, with CLAUDE.md as the day-to-day reference and the DECISION_LOG as the canonical record.

**Consequences:**

Every polish-phase decision after the standard’s codification (commit 566f417) is interpretable through it. The polish list’s mix of code commits, documentation refreshes, and “dropped as no-op” entries reflects the standard’s discipline directly — not every polish item warranted code, and recognizing that was itself the polish work.

Future product decisions follow the same standard. New features must pass both the user-experience and maintainer-experience tests. New refactors must demonstrate user-visible benefit (or at minimum, no user-visible regression). New documentation must be accurate enough to bootstrap a fresh chat session without misleading it.

The standard is referenced verbatim from CLAUDE.md (the day-to-day operating doc) and from CHATBOT_HANDOFF.md (the fresh-chat-bootstrap doc). It is invoked by name in commit messages and patch prompts when it’s the deciding factor in a non-obvious choice (“per the dual-delight standard, this fix is dropped as no-op”). Over time, this builds a shared vocabulary for decision-making across the project.

## D-051 — Out-of-scope C4L plugins deferred pending non-department content tier

Date: 2026-05-24
Status: Accepted (deferred implementation)

**Context:**

The Claude for Legal (C4L) skill ecosystem ships nine in-scope plugins that were imported into legalOS across migrations 0024–0040, plus four out-of-scope plugins that were deliberately not imported during the C4L integration arc:

- **law-student** (13 skills): academic learning aids for law students — bar prep coaching, case briefing, IRAC grading, Socratic drilling, cold-call prep.
- **legal-clinic** (16 skills): clinical legal education for law school clinics serving pro-bono clients — immigration intake, housing case workflows, family law support, consumer protection, criminal defense, civil rights.
- **legal-builder-hub** (10 skills): meta plugin for discovering and installing community C4L skills — effectively the C4L marketplace surface.
- **cocounsel-legal**: Thomson Reuters Westlaw partner plugin using a different MCP-based architecture than the open-source plugins.

Polish #9 surfaced the question: what should legalOS do with these four plugins? The “out of scope” framing assumed they didn’t fit the product, but the polish phase’s strategic discussion revealed that the underlying question was about product positioning — is legalOS in-house-counsel-only, or is it broader?

**Decision:**

legalOS is broader than in-house counsel — academic, clinical, and other legal segments are in scope long-term, with the option to pare focus down later if data justifies it. However, the four out-of-scope C4L plugins are deferred from implementation pending infrastructure that doesn’t yet exist. Specifically:

- **law-student and legal-clinic** are user-segment content (academic and clinical respectively) that belongs in a new content tier — a separate rail group with a separate entity type, NOT additional departments. Mixing academic and clinical content into the Departments group would dilute both the in-house product and the academic/clinical surface, and would create taxonomic confusion (Bar Prep Coach is not a peer of Corporate Counsel).
- **legal-builder-hub** is meta/registry content (a community-skill marketplace) that would surface alongside admin tooling, not in the workspace’s primary content rail.
- **cocounsel-legal** is a partner integration that belongs in the Integrations tier when partner integrations are formalized.

None of these four are imported today. Documentation in `docs/C4L_DEFERRED_SKILLS.md` and `docs/CHATBOT_HANDOFF.md` records the deferral and trigger conditions.

**Reasoning:**

Three factors drove the deferral:

First, **no current user demand.** legalOS today has no users from academic or clinical segments. Building infrastructure (new rail group, new entity type, new schema, new RLS policies, new launchpad surface, new agent-attribution model) to host 29 skills with zero users in those segments is wildly disproportionate to the value. The dual-delight standard explicitly prohibits pre-emptive solving of imagined problems.

Second, **the wrong shape would be hard to undo.** The temptation to add law-student and legal-clinic as additional departments (cheap; same data model as the 13 existing departments) would mix conceptually-distinct content into the same taxonomy. Once mixed, the dilution would be hard to reverse without a future schema migration and user-visible disruption. Deferring until a separate content tier is built avoids the wrong-shape trap.

Third, **strategic flexibility is preserved without code.** “Broader now” gives legalOS the option to act when a real user from a new segment surfaces. That flexibility doesn’t require infrastructure today; it requires the option to act, plus accurate documentation of what would be required when the moment comes. Both are achievable through documentation alone.

The four plugins map cleanly to three different futures (non-department content tier, admin marketplace, Integrations tier). Treating them as a single deferred bucket would have obscured those distinctions. Treating them individually preserves the option to ship each on its own appropriate surface when that surface exists.

**Alternatives considered:**

- **Rejected — Import law-student and legal-clinic as new Departments now.** Cheapest infrastructure (same data model as existing departments, sort_orders 14 and 15). Wrong conceptual home: students and clinical attorneys don’t think of Bar Prep Coach as a peer of Corporate Counsel. Would dilute both the in-house product and the academic/clinical surface. Would also reverse poorly once a separate content tier eventually exists.
- **Rejected — Build the non-department content tier now.** Most correct long-term architecture. Substantial infrastructure work — easily a multi-commit arc covering a new rail group, new entity type with its own schema, RLS policies, a launchpad-equivalent surface, and an agent-attribution model for non-department content. Disproportionate to host 29 skills with zero current users in the target segments.
- **Rejected — Decide legalOS is in-house-counsel-only and close out the four plugins permanently.** Most conservative scope. Forecloses on a real strategic option (multi-segment legal software) without evidence to support the foreclosure. The “broader now” framing preserves optionality at zero cost; closing it would be premature.
- **Rejected — Surface the four plugins via a Marketplace concept today.** A general “browse and adopt external content” surface (skill marketplaces, partner integrations, community contributions) is a real future direction, but building it for four plugins is the same scope problem as the non-department content tier. Defer.

**Consequences:**

The four out-of-scope C4L plugins remain unimported. Documentation in `docs/C4L_DEFERRED_SKILLS.md` and `docs/CHATBOT_HANDOFF.md` (deferred-work section) records:

- That legalOS’s product positioning is broader than in-house counsel
- The plugin-to-future mapping (non-department content tier for law-student + legal-clinic; admin marketplace for legal-builder-hub; Integrations tier for cocounsel-legal)
- The trigger conditions for revisiting: either (a) the first real user from an academic or clinical segment signs up and demonstrates demand, OR (b) the broader product strategy explicitly requires marketing-visible content for those segments before users arrive

When a trigger condition is met, the implementation work that follows depends on which plugin’s surface is needed first. Each surface (non-department content tier, admin marketplace, Integrations) is its own multi-stage build; this decision does not lock in a specific architecture for any of them, only the principle that they are distinct from the existing Departments group.

The standalone “Departments” framing in the current product is preserved — academic and clinical content do not become departments by mistake during ongoing work. The 13-department taxonomy stays clean.

## D-052 — Return-to-send keyboard contract for the chat composer (reverses Session 17b)

Date: 2026-05-26
Status: Accepted (reverses the Session 17b ⌘+Return decision)

**Context:**

The chat composer at /workspace/agents/[id] previously required ⌘+Return to send, with plain Return inserting a newline, and displayed a persistent hint below the composer documenting that contract. That contract was chosen in Session 17b to protect against accidental sends of multi-paragraph legal prompts — a defensible concern, but one that diverges from the behavior of every chat product the operator's users touch daily (Claude.ai, ChatGPT, Gemini, Slack), all of which send on Return. The chat page redesign arc reopened the question.

**Decision:**

The composer uses Return to send, Shift+Return for a newline, and Esc to stop an in-flight generation. The persistent hint text documenting the contract is removed in the same change. This reverses the Session 17b ⌘+Return decision.

**Reasoning:**

User expectation wins over edge-case protection. Return-to-send is the universal contract across every chat product users interact with daily; diverging from it imposes friction on every single message in order to guard against an occasional accidental send. Shift+Return for a newline is itself universally known, so users composing multi-paragraph prompts keep a familiar affordance. The accidental-send worry that motivated Session 17b is real but smaller than the constant cost of contradicting established muscle memory. The hint text is dropped because modern chat surfaces don't display these instructions persistently; users learn the pattern within a session, and a permanent instruction line is visual debt.

**Alternatives considered:**

- **Rejected — Keep ⌘+Return (the Session 17b position).** Preserves accidental-send protection but creates friction on every interaction and contradicts the muscle memory users bring from every other chat product.
- **Rejected — Make it configurable per user.** Adds a settings surface and persistence complexity for a low-stakes choice. A contract that every other product treats as a default shouldn't become a legalOS preference toggle.

**Consequences:**

The keyboard contract (Return to send, Shift+Return for a newline, Esc to stop) is now the standard for the chat composer and the reference for any future compose-and-send surface in the product. Shipped in commit 5ea1507 (the structural redesign, commit 1 of the chat page redesign arc), which also removed the hint text. Session 17b's reasoning is preserved in its original form per the immutable-history rule; this entry supersedes its conclusion.

## D-053 — Concentric-circles motif deployed scarcely for brand impact

Date: 2026-05-26
Status: Accepted

**Context:**

The concentric-circles motif originates in components/landing/landing-glyph.tsx as the marketing visual identity. During the chat page redesign, the initial plan applied the motif to the SendButton, transitioning from concentric circles at rest to an upward arrow on hover. That raised a general question: where, and how often, should a distinctive brand mark appear inside the product?

**Decision:**

The concentric-circles motif is deployed scarcely across the product to preserve its meaning. It currently lives in exactly two intentional places: the landing-page brand mark, and the chat ThinkingGlyph shown while an agent is generating a response. The SendButton uses a clean, polished arrow instead of the motif.

**Reasoning:**

The SendButton is a constant UI element users see hundreds of times per session; putting the motif there would dilute it into background furniture users stop noticing. The ThinkingGlyph appears only briefly, during agent generation — a genuine high-impact moment that benefits from brand reinforcement. The principle: deploy distinctive brand motifs at moments that earn them, not as decoration on common UI. Scarcity preserves meaning.

**Alternatives considered:**

- **Rejected — Apply the motif to both the SendButton and the ThinkingGlyph.** The initial arc plan; reconsidered as over-deployment that would erode the motif into a button people stop noticing.
- **Rejected — Restrict the motif to the landing page only.** Too scarce. The ThinkingGlyph is a genuine in-product brand moment and the strongest natural home for the motif inside the workspace.
- **Deferred — Extend the motif to other thinking states (future workflow thinking, document-analysis thinking, and the like).** A viable extension if those surfaces emerge, and consistent with the scarcity principle because thinking states are inherently brief and high-attention.

**Consequences:**

The ThinkingGlyph was introduced in commit 711d746; the SendButton was kept as a polished arrow rather than a concentric-circles morph in commit 1bbdce3. Roadmap items 4 (workspace home dashboard revamp) and 5 (brand mark concentric-circles upgrade) will weigh this principle when extending the motif to other surfaces; the rail brand mark is the natural third placement. Any future use of the motif is measured against the scarcity test: does this moment earn the mark, or would it become decoration?

## D-054 — Per-message destination hub on chat messages: kebab pattern, verb convention, footnote citations, branded attribution

Date: 2026-05-26
Status: Accepted

**Context:**

Per-message Word (.docx) export shipped in Session 8k as a direct "Download as Word" button on the bottom-left action row of completed assistant messages. The Word export arc reopened the surface to add citation support (the renderer deliberately stripped citation markers and dropped link URLs as a known deferral) and to anticipate additional destinations the operator described as imminent: Google Docs, Box, text/SMS, email (Gmail/Outlook/Mail), Slack, and similar. A consolidated design decision was needed for where and how those destinations surface.

**Decision:**

The destination hub for per-message export and send-to actions is a kebab menu (MoreHorizontal) on the per-message action row. The row was Copy · Download before this arc and collapses to Copy · ⋯ once Word moved into the menu. Future destinations join the kebab as items rather than as new icons in the row.

Within the menu, verbs follow a two-word convention:

- "Export to <X>" for file-producing destinations (Word, Google Docs, Excel, PDF).
- "Send to <X>" for messaging destinations (Slack, Gmail, Outlook, Messages, SMS).

Each item's destination name uses the everyday term users say ("Word", not ".docx" or "Microsoft Word"; "Google Docs", not "GDocs"). The leading icon is a Lucide glyph (FileText for Word in phase 1); partner-brand logos are deliberately not used, to keep the icon palette consistent across a growing list of destinations.

The exported .docx itself adopts three patterns the arc established:

- Citations become Word footnotes. Citation markers in the body become FootnoteReferenceRuns indexed in body first-appearance order; a "Sources" section closes the document with a Word-native numbered list whose numbers match the footnote numbers.
- Filename pattern: `<Agent name> - <YYYY-MM-DD>.docx` (UTC), with the agent name sanitized for cross-platform filesystem safety. The product name is intentionally absent from the filename to avoid grep-and-replace work on a future product rename.
- Document attribution lives in a page footer ("Exported from {siteConfig.siteTitle} on {Month DD, YYYY}") pulled from the existing single source of truth in config/site.ts. A product rename flows through automatically.

The agent edit form does not carry per-agent destination configuration. The kebab on the message is the destination-discovery surface; connectors will be workspace-level under roadmap item 1 phase 2 (Connections).

**Reasoning:**

Direct buttons in the action row work for one or two destinations and become noise at five or more. The kebab is the standard pattern across consumer SaaS (Notion's share menu, Linear's issue-action menu) for exactly this reason: it absorbs new destinations without re-litigating placement each time. Establishing the kebab from day one with a single item is less disruptive than introducing it later when the second destination forces the question.

The "Export to" / "Send to" verb split carries the mental model: export produces a file the user takes with them, send delivers content to a person or channel. Both verbs are universal across the consumer products users already know. Choosing once, now, prevents a mixed verb palette when the menu grows.

Footnotes were chosen over inline-numbered citation markers in the body because footnotes are the conventional citation form in legal work product, and Word's native footnote feature renders them at the bottom of each page where readers expect them. The Sources section duplicates the footnote content at the document end so a reader who prefers a bibliography view has one without losing the inline citations.

Workspace-level connectors (versus per-agent connector toggles) match every consumer SaaS we'd emulate: one connection per workspace, available everywhere it makes sense. Per-agent destination state would multiply storage (a column or JSONB blob), RLS implications, sync edge cases on fork or C4L re-import, and a configuration UI surface for a preference no user actually wants ("Word on Commercial Reviewer but not on Litigation Strategist" is a confusion-generator, not a use case).

The product name lives in config/site.ts and only in config/site.ts for surfaces that display it. Filenames don't display it; the document footer does. The operator may rename the product (D-052 and D-053 already touched user-facing copy; a name change sits in the broader future considerations), and the rename should be a one-file edit.

**Alternatives considered:**

- **Rejected — Keep the direct "Download as Word" button alongside a kebab for future destinations.** Preserves a one-click affordance for the dominant case but creates asymmetry the moment a second destination lands ("why is Word a button when Google Docs is in a menu?"). Re-litigating placement when the second destination ships is a worse outcome than the small additional click today.
- **Rejected — Pre-configure destinations on the agent edit form.** Reviewed in the arc when the operator surfaced a stale "Export to Word, Google Docs ... coming soon" line in the agent edit form. Workspace-level connectors are the right surface; per-agent toggles would multiply state with no real preference to express.
- **Rejected — Word-branded icon (the blue W) on the menu item.** On-brand for Microsoft but off-brand for legalOS, and the moment Google Docs / Excel / PDF land the icon palette becomes a mixed bag of partner logos. Lucide's FileText scales consistently across every file-producing destination.
- **Rejected — Citations dropped from the .docx (the prior state).** The renderer stripped citation markers and link URLs. Acceptable as a known deferral when the feature first shipped; not acceptable for legal work product where citation provenance is a core requirement.
- **Deferred — Full-conversation export (multiple messages stitched into one document).** A legitimate future feature (audit trail, "show your work"), most likely a header-level affordance or a kebab item once the Share & connector hub work lands. Per-message export serves the dominant lawyer use case ("send this great response to my client") and ships first.

**Consequences:**

The destination-hub pattern is now the standard surface for any future per-message export or send-to destination. New destinations land as items in the kebab using the "Export to" / "Send to" verb convention. The renderer's RenderMessageAsDocxInput shape (markdown, agentName, sources, exportedAt, productName) is the reference signature for any future renderer (e.g., a Google Docs renderer when Connections lands).

The former roadmap item 1 (full document export) closes with this arc; full-conversation export remains deferred to the new Share & connector hub item (roadmap item 2), which depends on the Connections phase of the chat attachments item (roadmap item 1 phase 2).

Shipped across commits cf8df0e (renderer), 1a284af (kebab UI), 5c5c811 (agent edit form cleanup).

## D-055 — Client-pre-allocated parent ids for chat attachments

Date: 2026-05-26
Status: Accepted

**Context:**

Phase 1 of the chat-attachments arc surfaced a timing problem. The documented Storage path for message attachments is `<user_id>/<conversation_id>/<message_id>/<filename>`, but at file-select time neither id necessarily exists. The message_id never exists yet (the chat route inserts the user message only on send), and the conversation_id doesn't exist for a fresh conversation (the route inserts the conversation on the first send). Files need to upload at attach-time, not wait for send, so the path has to resolve at upload. Three resolutions were available: pre-allocate both ids client-side and accept them server-side; simplify the path to drop the conversation segment; or upload to a staging path and move the file once the ids exist.

**Decision:**

The composer pre-allocates both `conversation_id` (when starting a fresh conversation) and `message_id` (every send) via `crypto.randomUUID()`, before any file is attached. The pre-allocated ids ride the upload server action's Storage path and the chat-route send payload. The chat route accepts client-supplied ids in its conversation-create and user-message-insert branches: when supplied, the route inserts with the client value and surfaces a 23505 unique-violation as a 409 conflict (`conversation_id_conflict`, `message_id_conflict`); when absent, the route falls back to server-side id generation (the existing behavior, preserved for backward compatibility with any legacy or non-composer payload). The path convention is preserved verbatim: `<user_id>/<conversation_id>/<message_id>/<filename>`.

This extends the precedent established by the draft-mode agent flow, which already pre-allocates `agent_id` client-side so file uploads can resolve to their final path before the agent row exists. The chat-attachment work makes this a general pattern: when a parent id is needed at upload time and the parent doesn't exist yet, the client allocates the id and the server accepts it with validation.

**Reasoning:**

Three considerations pointed to client-pre-allocation.

Maintainer consistency. The draft-mode agent flow already pre-allocates parent ids. Choosing the same pattern for chat attachments means one mental model across the codebase ("the client pre-allocates parent ids when uploads need them") rather than two parallel patterns ("client pre-allocates for agents, server stages-and-moves for messages"). The dual-delight standard treats fake symmetries as actively harmful; reusing the existing pattern avoids inventing a second one.

Storage-convention preservation. Dropping the conversation_id segment from the path (the simpler alternative) would have diverged from the documented convention. Future engineers reading the two paths would see different schemes across agent and message attachments and have to wonder why. Pre-allocation lets the one convention hold.

Failure-mode reduction. A staging-then-move alternative doubles Storage I/O per send, adds orphan-cleanup pathways for half-moved files, and creates a window where a file exists at a temporary path while the canonical path is empty. Pre-allocation eliminates all three: the file lives at its final path from the first moment it exists in Storage, remove-before-send purges from the canonical path, and send commits the row. No orphan windows, no move failures, no inconsistency between Storage and metadata.

The trust surface is the cost. Client-supplied ids become primary keys, which is a new trust boundary, so validation discipline at the route layer is non-negotiable: UUID-shape required, unique-violation surfaced as 409, and the existing "fetch or 403" pattern for conversation_id gracefully covers cross-user UUID collisions (RLS returns not-found, the route returns 403, no leak). The route-layer validation is the binding contract; the schema is only the entry point.

The schema was also kept backward-compatible during the arc itself. A breaking schema change between the server-foundation commit and the composer-UI commit would have left the production composer broken for the window between them. The arc preserved forward-compat for the legacy composer's payload throughout, and the optional/nullable fields remain the canonical shape going forward: a non-composer caller (a programmatic client, a future workflow surface) can omit the ids and let the server generate them. Pre-allocation is the encouraged path; back-compat is the safety net.

**Alternatives considered:**

- **Rejected — Simplify the path to `<user_id>/<message_id>/<filename>` for message attachments, dropping the conversation segment.** Easier to implement today (no conversation_id pre-allocation needed). Diverges from the documented convention and creates asymmetry between the agent and message attachment path schemes, which future engineers would have to internalize without explanation. Convention drift is a long-term cost.
- **Rejected — Staging path with a server-side move on send.** Conceptually clean (the server orchestrates id allocation and file placement) but doubles Storage I/O per send, introduces orphan-cleanup pathways for half-moved files, and adds a temporary state where Storage and metadata diverge. None of those failure modes exist with pre-allocation.
- **Rejected — Make the schema strict (required `message_id`, non-nullable `conversation_id`) from the server-foundation commit onward.** This was the original spec for the foundation stage, corrected before commit. A strict schema between the foundation and composer-UI commits would have broken production chat for any user on the live composer, which sends neither field. The back-compat fallback is the durable shape: the client pre-allocates when it can, the server generates when it can't.

**Consequences:**

The pre-allocation pattern is now the standard for any future chat-surface upload that needs a parent id before the parent exists. The schema's backward-compatible shape (optional message_id, nullable conversation_id) is the durable contract; tightening it to required would re-introduce the production-break risk during any future multi-stage arc that touches the chat schema. The 409 conflict codes (`conversation_id_conflict`, `message_id_conflict`) are part of the route's standard error vocabulary going forward.

Shipped across commits 7928cae (server foundation accepting the client ids), 08b3690 (composer pre-allocating and sending them), 66499de (drop overlay reusing the same upload path), 4015093 (privacy disclosure on the same flow), and d3e42ee (visual correction to the affordance).

## D-056 — Home identity: a value-mirror with honest empty states

Date: 2026-05-28
Status: Accepted

**Context:**

The Stage 2b workspace home (greeting, Continue working, Recently used, Browse all) was functional but conceptually thin, and the workspace home dashboard revamp was the active roadmap item. A guiding identity was needed before composing the new home: what is the home page actually for, and what does it show when the data behind a section does not exist yet.

**Decision:**

The workspace home mirrors the user's actual work: their day (Today), their impact (Impact band), their matters (Matters), and their reading (Desk). It does not surface peripheral plumbing or duplicate the rail's navigation. Any section whose backing integration or data has not shipped renders an honest Connect placeholder or empty state, never dummy data presented to users as if it were real.

**Reasoning:**

legalOS is an AI-agent operating system for legal work; the home should make a lawyer want to open the product by reflecting their work back to them, not by listing app launchers or category tiles. Honest empty states preserve trust: a placeholder that says "not yet connected" is credible, whereas fabricated matters or meetings on a legal product's home would read as a demo prop and erode confidence. The value-mirror framing also gives every future home section a single test: does this reflect the user's work, and is its empty state honest.

**Alternatives considered:**

- **Rejected — A category-navigation dashboard (Departments / Knowledge / Workflows / Integrations / Help tiles).** This was attempted and reverted earlier (D-047): four of five tiles announced placeholder content and the surface read as a downgrade. The value-mirror home shows work, not navigation, and is the right shape until those categories have real content.
- **Rejected — Seed the home with sample data so it looks full.** Dishonest on a legal product; see the honest-empty-state half of the decision.

**Consequences:**

The home spine is greeting, a two-column Today and Impact row, Matters, and Desk. Every present and future home section is measured against the value-mirror identity and the honest-empty-state rule. The Reading-1 gating pattern (D-057) is the mechanism that lets a section be built ahead of its data while keeping its visible state honest. Shipped across the workspace home revamp and Matters arc (commits 60b9e3a through f47942e).

## D-057 — Reading-1 connected-state-gating pattern for not-yet-built integrations

Date: 2026-05-28
Status: Accepted

**Context:**

Two home surfaces depend on integrations that have not shipped: the Today card needs calendar data and the Matters section needs CLM / matter-management data. The integration work (OAuth, providers, a connections table) belongs to the Share and connector hub arc (roadmap item 1), which is later. The question was how to build these surfaces now without either shipping dead UI or showing fake data.

**Decision:**

Build the full rich connected view now, fully typed and code-complete, and gate it behind a connection-check function that returns false for now. The honest Connect placeholder is the current visible state for every user; the rich view is built into the code but not displayed. No sample data reaches users, and the rich view is unreachable until the gate flips. Applied to Today (`isCalendarConnected`) and Matters (`isMattersConnected`). Named the Reading-1 pattern.

**Reasoning:**

Building the connected view now, against real types, means the surface lights up the moment the integration lands with no further UI work and no design debt deferred to a rushed later session. Gating on a false-returning check keeps the visible state honest (the placeholder) while the dormant view is type-checked by the compiler on every build, so it cannot silently rot. The alternative of waiting until the integration ships would compress the UI work into the integration arc; the alternative of showing the view with sample data would violate the honest-empty-state half of D-056.

**Alternatives considered:**

- **Rejected — Defer the connected view entirely until the integration ships.** Compresses two arcs' worth of work into one and loses the design momentum of building the view while its design is fresh.
- **Rejected — Ship the connected view with sample data behind a flag.** Risks sample data reaching production and contradicts D-056's honest-empty-state rule.

**Consequences:**

Today and Matters each carry a built, typed, dormant connected view plus a visible placeholder. The Share and connector hub arc flips the gates by changing only the connection-check bodies (D-058). The pattern is the standard for any future home surface that depends on an integration not yet built.

## D-058 — Typed connection-helper pattern: production signatures, stub bodies

Date: 2026-05-28
Status: Accepted

**Context:**

The Reading-1 pattern (D-057) needs connection checks and data fetchers that exist now but return nothing until the integration ships. The shape of those functions determines how much rework the connector-hub arc will require to make the surfaces live.

**Decision:**

The connection checks (`isCalendarConnected(userId)`, `isMattersConnected(userId)`) and the data fetchers (`getTodaysEvents`, `getMatters`, `getMattersSummary`) carry their final production signatures now but return `false` / `[]` / `null`. Only the function bodies change when the integration ships; call sites are stable. Parameters that are unused while the body is a stub carry a targeted `eslint-disable-next-line @typescript-eslint/no-unused-vars` with a comment explaining why. No `user_integrations` (or equivalent) table is built in this arc; querying the integrations table is the connector hub arc's scope.

**Reasoning:**

Stable signatures mean the connector-hub arc edits bodies only, never call sites, so flipping a surface live is a localized change with no UI churn. Returning typed empties keeps the connected views compiling and renderable (the empty-connected state) without any data. The targeted eslint-disable is preferred over renaming params to `_userId`, because the project's lint config has no `argsIgnorePattern`, so an underscore would not silence the warning, and because the production signature should read with its real parameter names. Building the integrations table now would be speculative work owned by a later arc.

**Alternatives considered:**

- **Rejected — Omit the parameters until they are used.** Would change the signatures later and force call-site edits across the home when the integration ships.
- **Rejected — Build the integrations table and query it now (returning no rows).** Speculative schema work that belongs to the connector hub arc; pulls scope forward with no present benefit.

**Consequences:**

`lib/workspace/home/calendar-connection.ts` and `lib/workspace/home/matters-connection.ts` hold the checks, the typed shapes, and the stub fetchers. The connector hub arc (roadmap item 1) makes Today and Matters live by editing those bodies to query the connections it builds.

## D-059 — Productivity calculator stays localStorage for v1

Date: 2026-05-28
Status: Accepted

**Context:**

The Impact band has four cells. Agent runs and Top agent read real `usage_events`. Hours saved and Estimated cost saved depend on the productivity calculator's task book, which is still stored in localStorage (per D-010's analytics deferral), not the database, so the server cannot read it to compute those numbers.

**Decision:**

Hours saved and Estimated cost saved render an honest "Setup needed" state with an admin-gated CTA to the calculator, rather than a number. Promoting the calculator's task book from localStorage to the database, so those cells show real values for everyone, is a future sub-arc (under the admin section revamp), not part of this arc.

**Reasoning:**

The two real-data cells earn their place now; the two calculator-backed cells cannot show a trustworthy number until the task book is server-readable, and a fabricated or per-device number would violate the honest-empty-state rule (D-056). Scoping the database promotion out of this arc keeps the home revamp focused; the promotion is genuinely adjacent to the admin and analytics work (roadmap items 2 and 17) and belongs there.

**Alternatives considered:**

- **Rejected — Read the localStorage task book client-side and render the numbers.** Per-device and not server-truthful; two users on two machines would see different impact numbers, and the cell would be empty on a fresh device.
- **Rejected — Drop the two cells until the data exists.** The Setup-needed state is more honest and more useful: it tells admins exactly what to do to light the cells up.

**Consequences:**

The Impact band ships with two real cells and two Setup-needed cells. The database promotion of the calculator task book is tracked as future work adjacent to the admin revamp and analytics promotion (roadmap item 17, per D-010).

## D-060 — No serif: Inter Tight everywhere, no font-serif token

Date: 2026-05-28
Status: Accepted

**Context:**

During the home revamp the question of an editorial serif for headings surfaced (a common move for a "premium" feel). The project's type system uses Inter Tight for display and Inter for body, with a mono family for captions and code; there is no serif family loaded and no `font-serif` token in the theme.

**Decision:**

The home, and the app, use Inter Tight and Inter only. There is no serif. This is recorded so future work does not reach for a `font-serif` token that does not exist or assume a serif is available.

**Reasoning:**

A single sans family (with the mono accent) is the established product voice and matches the clean, modern register the product targets. Introducing a serif would mean loading another font (a real performance and consistency cost) and would fragment the type system for a stylistic flourish that the current design does not need. Recording the absence prevents a future session from writing `font-serif` (which would silently fall back to a system serif and look like a bug) or proposing a serif heading without realizing it is a net-new font decision.

**Alternatives considered:**

- **Rejected — Add an editorial serif for home headings.** A net-new font load and a fork in the type system for a flourish the design does not require.

**Consequences:**

Any future proposal for a serif is a deliberate type-system decision (new font, new token), not a quick className change. `font-serif` is not a valid token in this codebase.

## D-061 — Tools section removed from the home; connection-status strip may return

Date: 2026-05-28
Status: Accepted

**Context:**

The home briefly carried a Tools section: three "Connect" launcher cards for Slack, Mail, and Drive. Under the value-mirror identity (D-056), the question was whether a launcher for ambient apps belongs on the home at all.

**Decision:**

The Tools section is removed from the workspace home. Slack, Mail, and Drive are always-open ambient apps that do not need a home-page launcher, and connection management already lives in the rail's Integrations area (Connections, Marketplace). The `IntegrationsRow` and `IntegrationCard` components are retained unmounted, with retention notes, rather than deleted. A compact connection-STATUS strip ("N of M tools connected, X needs reauth") is a different concept from the removed launcher and may return to the home or onboarding once integrations are real.

**Reasoning:**

A launcher for apps the user already has open is plumbing, not the user's work, so it fails the value-mirror test. The status concept is distinct: it reflects the health of the user's connections (their state), which is information rather than a redundant launch button, and it only becomes meaningful once real integrations exist. Retaining the components unmounted (the same retain-don't-delete discipline applied to `ContinueWorkingSection` and `sparkline.tsx`) keeps the work recoverable without leaving dead UI mounted.

**Alternatives considered:**

- **Rejected — Keep the Tools launcher on the home.** Duplicates the rail's Integrations area and surfaces plumbing rather than work.
- **Rejected — Delete the components outright.** The status-strip direction may reuse them; retaining unmounted with a note is cheap and reversible.

**Consequences:**

The home spine is greeting, Today and Impact, Matters, Desk. `IntegrationsRow` and `IntegrationCard` are unmounted but retained. The connection-status strip is captured as a note under the Share and connector hub roadmap item, dependent on real integrations existing first.

## D-062 — Settings as a peer mode to workspace and admin

Date: 2026-05-28
Status: Accepted

**Context:**

The connector hub arc requires a place for users to manage their own personal connections (their Google Drive, Calendar, and similar). The codebase had no user-settings surface; the existing `/workspace/integrations/connections` route was a coming-soon stub conceptually positioned as workspace-level Integrations chrome rather than user-level settings.

**Decision:**

Establish a new top-level settings area at `/workspace/settings` as a peer mode to workspace and admin. Settings has its own left rail (`SettingsRail`, mirroring `AdminRail`'s chrome via the shared `rail-styles.ts` tokens), its own layout, its own landing page with cards for sub-pages, and a "Settings" entry in the profile-block dropdown. Initial sub-pages: Connections (real, building over the arc), Profile (coming soon), Display (coming soon).

**Reasoning:**

The three-mode architecture (workspace, settings, admin) reflects three genuinely different kinds of work: doing the actual work (workspace), managing your personal account (settings), and governing the organization (admin). Surfacing this as three peer rails uses the existing pattern (admin already replaces the workspace rail) extended consistently. Personal connection management belongs in settings, not in workspace-level chrome, because connections are personal decisions made within admin-set policy. The rail Integrations group at `/workspace/integrations` will be removed entirely in a later milestone of this arc once Connect CTAs are repointed.

**Alternatives considered:**

- **Rejected — adding a user-settings dropdown panel rather than a peer mode.** Considered briefly; settings needs to grow to multiple sub-pages over time, and a dropdown wouldn't scale.
- **Rejected — building connection management directly inside the existing workspace rail.** Conflated personal account management with workspace navigation; settings deserves its own coherent surface.
- **Rejected — using a modal or overlay for settings.** Modal patterns don't support deep linking, multi-page settings, or the polish standard this arc requires.

**Consequences:**

- The rail-switching architecture (`RailSwitcher`) gains a third branch; this is cheap (one server-rendered prop, one branch) and the existing drift-prevention discipline (shared tokens via `rail-styles.ts`) ensures the three rails stay visually consistent. The settings landing page establishes the LANDING CARD pattern that the admin landing will adopt in a future admin polish arc (portability principle: settings primitives port to admin when its arc arrives).
- Connect CTAs throughout the app continue to point at the old `/workspace/integrations/connections` during this milestone; they will be repointed and the old route tree removed in a later milestone of this arc, allowing each milestone to land independently without breaking links.
- The settings layout deliberately does not impose a `<main>` / width wrapper the way the admin layout does, because the coming-soon sub-pages reuse `ComingSoonContent` (a full-height centered `<main>` of its own) and a layout-level `<main>` would nest landmarks; each settings page owns its main instead.
- Amendment (follow-up polish commit): the settings landing's LANDING CARD pattern noted above was replaced by a refined list (label, description, trailing arrow, hairline separators between rows, no card frame), and the settings rail gained a lead-line "Settings" anchor above its sub-pages to mirror the admin rail's anchoring. Cards added false weight to navigation-only content (each card was just a link to a sub-page, with no contained object to justify the frame); the refined list reads as more confident. The landing heading also moved from a one-off 22px size to the canonical page-title scale shared by the workspace home and department landings. The portability target is unchanged: this refined-list LANDING pattern is what the admin landing adopts when its own arc arrives.

## D-063 — Capability-grouped Connections page with provider-agnostic visual taxonomy

Date: 2026-05-28
Status: Accepted

**Context:**

The Connections page surfaces every supported integration provider. The architectural commitment (D-062, connector hub arc) requires provider-agnostic design: capability-grouped (File storage, Calendar, Mail), not vendor-grouped. The page's information architecture must directly embody this principle.

**Decision:**

The Connections page renders capability groups (File storage, Calendar, Mail, Matter management), each containing one or more providers. Providers are rows within their capability group, not standalone cards. Group titles are at workspace-section heading scale (17px font-medium); group descriptions immediately below carry the editorial voice and any group-level policy notes. Provider rows render as a refined list with consistent visual treatment regardless of vendor: no vendor logos as primary visual elements, no marketplace-grid aesthetic. Org-level providers (only Matter management for now) render with subtle visual differentiation (bg tint, "Org" badge, "Connected by your admin" status) within the same capability group personal providers would live in; they are not segregated into a separate "Org Connections" section.

**Reasoning:**

Lawyers don't think about their tools by vendor; they think by capability ("I need my files accessible to my agents"). Capability-grouped IA surfaces the right mental model and scales gracefully: when Microsoft OneDrive arrives, it slots into the existing File storage group without restructuring. The provider-agnostic visual treatment means the page reads as a coherent system rather than a vendor marketplace, which preserves the considered register the polish standard requires. Org connections within their capability group (vs. segregated) keep the mental model unified: a user looking at File storage sees everything that gives them file-storage capability, whether they connected it or their org did.

**Alternatives considered:**

- **Rejected — vendor-grouped IA (Google block, Microsoft block, and so on).** Mirrors the underlying OAuth integration model but doesn't reflect how users think about their tools; would require restructuring as cross-vendor providers arrive.
- **Rejected — provider-card grid with prominent vendor logos.** Marketplace aesthetic; pulls the page toward shopping rather than considered professional decision-making.
- **Rejected — separate sections for "Your connections" and "Org connections."** Conflates two different organizational principles (capability vs. ownership); creates a worse mental model than capability-first with ownership as a visual treatment within each group.

**Consequences:**

- The visual primitives established here (capability group structure, refined provider rows, Connect affordance treatment, org-row visual differentiation) become the connection-management visual language across the product. The Admin Connections page (a later milestone of this arc) will use the same primitives at admin scope.
- Adding a new provider is a data-only change: a new entry in the capability group's providers array (or a new group if it is a new capability). No UI restructuring required.
- The page is fully content-driven from a typed data structure (`lib/settings/connections-data.ts`), ready for the real data layer (a later milestone) to replace the hardcoded providers without a UI rebuild.
- The Connect affordances are inert visual elements in this commit (non-interactive spans), so no broken navigation ships; they become real interactive controls when the OAuth flow lands.
- Amendment (follow-up polish commit): the connection-management visual language is now flat editorial rows with a rounded highlight on hover (consistent with the settings landing), not framed boxes. The permanent rounded-xl bg-card group frames were removed; capability groups are delineated by typography and spacing. The org row's permanent subtle tint is retained as a meaningful ownership signal and is the one principled exception to flat-at-rest (the tint encodes admin-ownership, not decoration). Also in the same commit: "Microsoft OneDrive" display name shortened to "OneDrive" to match real usage, a Messaging capability group (Slack, Microsoft Teams) was added, and the org-example status was made honest ("available soon", since no matter-management integration is built yet).
- Amendment (spatial polish commit): the settings pages (landing and Connections) are left-justified to match the department pages' left-aligned spatial language (content anchored at the body's left margin, capped at a single-column max-width, not centered). Connection provider rows gained a grounding state-dot in a fixed-width left column, a new connection-management visual primitive: hollow slate ring = available/not-connected, solid slate = connected (built, activates with real connections), faint filled = coming-soon. The dot encodes state visually (provider-agnostic, aria-hidden, with the text status line as the accessible source of truth) and is consistent with the Matters activity-dot and the rail brand-dot.

## D-064 — Connection data model: connections + grants + policy, extensible capabilities

Date: 2026-05-28
Status: Accepted

**Context:**

The connector hub arc requires a data model for connections that supports both personal and org-level scope, separate read/write (and future) capabilities, super-admin governance, and an SSO-deprovisioning foundation. The model must scale to the later automation vision (matters auto-routing from a CLM, agents triggering on inbound events) without a teardown.

**Decision:**

Three tables. `connections` holds the provider link (provider id, capability category, scope personal/org, owner, token reference, status); it never holds raw OAuth tokens (a `token_ref` points to an encrypted secrets store wired in a later milestone). `connection_grants` holds who can use a connection and with what capabilities, as an extensible-but-validated text array (allowed set read/write now, extended later by altering a CHECK constraint, not migrating data). `connection_policy` is a super-admin-governed singleton holding allowed categories, allowed providers, and the default capability ceiling (seeded read-only). RLS enforces: users see and manage only their own personal connections; org connections are visible to granted users; only super admins create or modify org connections and policy. Deprovisioning cascades via on-delete-cascade on the user references (deleting a user removes their connections and grants), which is the SSO-deprovisioning foundation. The two audit columns (created_by, granted_by) use on-delete-set-null and are nullable, matching the existing `agents.created_by` pattern, so deprovisioning a creator does not block deletion or destroy shared org connections.

**Reasoning:**

The connections-plus-grants split (vs. a single overloaded table) cleanly models the org-level case (one connection, many users granted at varying capabilities) and is the shape the future routing layer wants (a routing rule references connection + user + capability). The capabilities array (vs. a read/write/read_write enum) was chosen deliberately because the automation futures introduce real capabilities beyond read/write (trigger, route, notify); the array absorbs these as new validated values without a column migration. Building the policy table now (UI in a later milestone) keeps the data model complete in one commit and gives the helpers a real policy to read. Tokens never live in the connections table for security; the `token_ref` seam is ready for the encrypted store wired with OAuth. RLS reuses the project's existing helpers and style (`current_user_role()`, security-definer cross-table helpers like `has_department_access`), so the security model stays consistent and reviewable; cross-table checks (owns_connection, has_connection_grant) are security-definer to avoid policy recursion between connections and connection_grants.

**Alternatives considered:**

- **Rejected — single connections table with a scope column and no grants table.** Breaks down on the org case (one connection, many users at different capabilities cannot be a single row); would require overloading or row duplication.
- **Rejected — capabilities as a read/write/read_write enum.** Tighter now but forces a migration each time the automation layer introduces a new capability; the later vision makes those capabilities a near-certainty, so the array avoids a known-coming teardown.
- **Rejected — storing OAuth tokens directly in the connections table.** Security risk; tokens must live in an encrypted store with stricter access, referenced (not stored) by the connections table.

**Consequences:**

- The data model is complete and scalable in one commit; OAuth (a later milestone) populates connections and grants, flipping the dormant UI and gates to real state with no schema change.
- The capabilities CHECK constraint is the single place to extend when automation capabilities arrive (alter the allowed set; no data migration).
- The on-delete-cascade user references are the SSO-deprovisioning mechanism: an IdP deprovisioning a user (deleting the auth.users row, via SCIM or manual removal in a later enterprise milestone) cascades to remove their connections and grants automatically.
- Deviation noted: the task spec listed created_by_user_id and granted_by_user_id as not-null; they ship nullable with on-delete-set-null instead, matching `agents.created_by` and avoiding a deprovisioning footgun (a not-null audit FK would either block deleting a creator or, with cascade, delete shared org connections when their creator leaves). A separate `sso_identity_ref` column was also omitted: grantee_user_id IS the SSO-resolved identity and its cascade IS the deprovisioning mechanism.
- The migration is applied by hand in the Supabase SQL Editor (the project's standard path); the dependent helpers fail safe to "not connected" so the home never breaks even before rows exist.

## D-065 — OAuth flow architecture: provider-agnostic registry, single callback, encrypted token storage

Date: 2026-05-29
Status: Accepted

**Context:**

Connecting a tool (Google Drive first) requires a real OAuth 2.0 authorization-code flow that obtains and stores tokens for later API calls. The architecture must be provider-agnostic (Google now; Microsoft, Slack, Box later) per the connector-hub commitment, and must handle tokens securely.

**Decision:**

A provider registry maps each providerId to an adapter that supplies its OAuth endpoints, scopes, and token-exchange/refresh logic. A single provider-agnostic callback route (`/api/connections/callback`) handles all providers, distinguishing them via the OAuth state parameter, rather than a per-provider callback path. Tokens are stored encrypted (application-level AES-256-GCM in a dedicated `connection_secrets` table with RLS enabled-and-forced and no policies, so only the service-role key can access it); the connections table holds only a `token_ref`. The flow is CSRF-protected via a validated state parameter (signed with HMAC, cross-checked against a sealed httpOnly cookie nonce, and bound to the initiating user id), with PKCE (S256) applied even though this is a confidential client. Google Drive uses read-only scope (`drive.readonly`), matching the default read-only policy ceiling; write scopes are deferred to the write-capability-grant feature. `access_type=offline` + `prompt=consent` obtain a refresh token.

**Reasoning:**

The registry + single-callback design means adding a provider is adding an adapter, with zero flow or route changes — the provider-agnostic commitment realized concretely. A single callback (vs. per-provider paths) means one redirect URI to register per environment and one place to maintain the exchange logic. Encrypted token storage with only a reference in the connections table keeps raw credentials out of normal queries and the client, satisfying the security posture. Application-level AES (vs. Supabase Vault) keeps the encryption boundary fully in our control, requires no extension, and matches the project's hand-applied migration workflow; the key lives in a server-only env var (`CONNECTION_TOKEN_ENCRYPTION_KEY`), never in the database. Read-only-first matches the policy ceiling and is the lower-risk default; write is a deliberate later grant.

**Alternatives considered:**

- **Rejected — Supabase native OAuth sign-in / linkIdentity.** Designed for authentication (signing into the app), not for connecting a tool to call its API with specific scopes and stored refresh tokens; awkward fit for the connector use case.
- **Rejected — per-provider callback routes.** More routes to register and maintain; the single state-routed callback is the cleaner provider-agnostic shape.
- **Rejected — storing tokens in the connections table.** Security risk; tokens live encrypted, referenced not stored.
- **Rejected — Supabase Vault for token storage.** Viable, but adds an extension dependency and security-definer wrapper functions for access; application-level AES in a service-role-only table is simpler to reason about, fully under our control, and fits the hand-applied migration workflow.

**Consequences:**

- Adding Calendar, Gmail, Slack, Microsoft, Box is adding an adapter to the registry; the flow, callback, storage, and UI wiring are reused.
- The encryption mechanism (the `connection_secrets` table + AES-256-GCM) is the single place token security is enforced. Rotating `CONNECTION_TOKEN_ENCRYPTION_KEY` invalidates all stored tokens (users reconnect).
- This is the project's first use of the Supabase service-role client (`lib/supabase/admin.ts`), introduced narrowly for the policy-less `connection_secrets` table; it is `"server-only"` and must not be used to skip RLS on user-scoped tables.
- The redirect URI is resolved from `NEXT_PUBLIC_SITE_URL` (not `VERCEL_URL`), because the per-deploy `VERCEL_URL` host is not a registered redirect URI; preview deployments cannot complete a real OAuth round-trip unless their host is also registered — the intended trade-off for one stable redirect URI per environment.
- In Testing-status External apps Google expires refresh tokens after 7 days, but this project uses an Internal consent screen (the Workspace Cloud org was provisioned), so refresh tokens do not have that expiry — connections persist normally.

## D-066 — Connection policy enforced in a shared layer; admin editing UI deferred to the Admin arc

Date: 2026-05-29
Status: Accepted

**Context:**

The connector hub's architectural principle is that a capability must be governed before it is exercised. The connection_policy table (allowed categories/providers, capability ceiling) existed from M3, with enforcement partially present in the initiate route. M6 will let agents exercise connection capabilities (reading Drive files), so policy enforcement had to be complete and consistent before that. Separately, the admin information architecture is unresolved and is being deliberately deferred to a dedicated Admin arc.

**Decision:**

Consolidate policy enforcement into a single shared server-side module (lib/connections/policy.ts) used by every connection operation: the initiate route gates on allowed category/provider, the callback constrains granted capabilities to the policy ceiling (policy-derived, not hardcoded), and a canExerciseCapability gate is provided for capability-exercise paths (M6) to check live policy plus grant. Do NOT build an admin UI to edit the policy in this arc. The policy remains at its seeded defaults (all current categories/providers allowed, read-only ceiling) and is changed directly in the database if needed, until the future Admin arc designs the admin surface and IA properly.

**Reasoning:**

Governance means enforcement, not necessarily a UI. Completing enforcement before M6 satisfies the govern-before-exercise principle without prematurely inventing admin structure that the Admin arc will redesign. The current admin section is an acknowledged placeholder; building a policy editor onto it now would create IA that gets torn up later. A single shared enforcement module prevents drift (every path enforces identically) and gives M6 and future providers one contract to call. Live policy checks (not just grant-time) mean tightening policy later constrains existing grants, which is the correct security posture. Application-layer enforcement plus M3's RLS is defense in depth.

**Alternatives considered:**

- **Rejected — build a minimal admin policy-editing page now.** Would invent admin IA while the admin structure is explicitly undecided; the editor belongs in the Admin arc where the surface is designed fresh.
- **Rejected — defer enforcement to M6.** Would exercise capabilities before governance is complete (the govern-before-exercise anti-pattern); enforcement must precede exercise.
- **Rejected — enforce only via RLS.** RLS is a backstop but doesn't express category/provider/ceiling policy cleanly; application-layer policy enforcement is the right primary layer, RLS the defense-in-depth backstop.

**Consequences:**

- M6 calls canExerciseCapability and inherits complete, consistent governance.
- Changing the policy before the Admin arc means editing the connection_policy row directly; acceptable for the current single-operator reality, and the seeded defaults are sensible.
- When the Admin arc builds the policy editor, it writes to the same connection_policy row this enforcement layer already reads; no enforcement rework needed, only the editing surface is added.
- Grant logic is policy-derived, so a future ceiling change (via that editor) is respected without code change.
- The enforcement helpers fail closed: if the policy row can't be read, no category/provider is allowed and nothing is grantable, so a read failure denies rather than permits.

## D-067 — Drive attachments are read live at agent run-time, via a token-exercise layer and format-aware content client

Date: 2026-05-29
Status: Accepted

**Context:**

Connected Drive files must be usable by agents. The chosen behavior is live-read (the agent reads the current Drive file at run-time), not a snapshot at attach time, for correctness (especially legal documents that change). The attachment content path is uniform (produce extracted_text, wrap in an <attachment> block) with a clean per-row insertion point; the schema was already Drive-ready (source_type gdrive_link, source_metadata); the M5 capability gate and OAuth token storage existed but had no consumers; there is a live user session at agent run-time.

**Decision:**

Resolve gdrive_link attachments live at run-time. A shared resolveAttachmentText(row, userId) branches on source_type: uploads use the existing cached/re-extracted text unchanged; gdrive_link rows call canExerciseCapability, then a token-exercise layer (read connection_secrets via service-role admin client, decrypt, refresh-on-expiry with re-encryption persisted), then a content client that fetches binaries via alt=media and exports native Google formats (Docs→DOCX, Sheets→XLSX, Slides→PDF) before the existing extractor, respecting the existing size/char caps and MIME allowlist. Unresolvable Drive attachments are surfaced as unavailable without failing the turn. Live Drive content is excluded from the cached prompt prefix.

**Reasoning:**

Live-read is the correct, most-trustworthy behavior for documents that change; snapshot would silently serve stale content. The single resolveAttachmentText seam keeps block assembly uniform and leaves the upload path untouched (regression-free). Supporting native Google formats via export (not just binaries) makes the integration feel complete rather than partial, which the product explicitly chose. The service-role boundary for connection_secrets is preserved (token read only after authorization, only via admin client). Graceful per-attachment failure protects the turn. Excluding live content from the prefix cache trades a little per-turn cost for correctness (never stale).

**Alternatives considered:**

- **Rejected — snapshot-at-attach (copy content when attached).** Simpler, but serves stale content when the Drive file changes; wrong for documents that evolve.
- **Rejected — binaries only (no native Google formats).** Simpler, but users couldn't attach their own Google Docs, which is much of real Drive content; the integration would feel half-there.
- **Rejected — caching live Drive content in the prefix.** Would serve stale content between turns, defeating live-read.

**Consequences:**

- canExerciseCapability gains its first consumer; the OAuth token primitives (decrypt, refresh) gain their first callers.
- A gdrive_link agent attachment costs slightly more per turn than a cached local upload (re-fetched, re-extracted, uncached) — the deliberate price of always-current content.
- The picker UI (M6b) creates gdrive_link rows; this backend resolves them, so hand-inserting a row tests the backend before the picker exists.
- Native-format support relies on Drive export; the drive.readonly scope already permits it.
- Only agent_attachments is Drive-ready in schema; message_attachments lacks source_type/source_metadata (migration 0007), so per-message Drive attachments need a follow-up migration (and a send-payload change). M6a did NOT add one silently; the message loader resolves uploads through the same seam and is one migration away from live message-Drive.

## D-068 — Message attachments made Drive-ready (schema + send plumbing) to match agent attachments

Date: 2026-05-29
Status: Accepted

**Context:**

M6a delivered live Drive reads and wired both chat-route loaders, but only agent_attachments had the Drive-ready schema; message_attachments lacked source_type/source_metadata, so per-message Drive attachments could not be created. The chat composer's plus affordance is the intended natural home for attaching a Drive file to a message (M6c), which requires this surface to be Drive-ready first.

**Decision:**

Add source_type ('upload'|'gdrive_link', default 'upload') and source_metadata jsonb to message_attachments, mirroring agent_attachments. Extend the send payload and the chat route's message-attachment insert so a Drive-backed attachment is persisted as a gdrive_link row carrying { fileId, name, mimeType } in source_metadata, with no upload or extraction at send time (content is resolved live at run-time by the M6a resolver). Local uploads are unchanged. source_metadata standardizes on fileId+name+mimeType so the attachment chip can render name/type instantly without a Drive call.

**Reasoning:**

Consistency between the two attachment tables keeps the resolver and UI uniform. Storing name+mimeType at pick time serves both the user (instant chip rendering) and the maintainer (one shape read everywhere). Not uploading/extracting Drive files at send time is the essence of live-read. Default 'upload' makes the migration backfill-free and the existing path safe.

**Consequences:**

- The message surface now matches the agent surface; M6c's picker writes gdrive_link rows to either.
- A migration is hand-applied (operator workflow); the upload path is safe pre-apply (additive Drive path, default upload). The message-attachment loader's SELECT is transitional-tolerant of the columns being absent (falls back to the legacy column set on Postgres 42703), so the upload path is safe even before the migration lands; that fallback retires once 0046 is confirmed applied.
- M6c (picker UI) is unblocked.
- Scope note: the message-attachment row insert lives in the chat route (app/api/chat/route.ts), not in lib/actions/message-attachments.ts (which only uploads + extracts local files). The Drive plumbing was added there, where the insert actually is; a Drive attachment needs no pick-time server action (no upload/extract), so message-attachments.ts is unchanged.

## D-069 — Drive listing/search layer, separate from content fetch, as the picker's data source

Date: 2026-05-29
Status: Accepted

**Context:**

The Drive picker (M6c2) needs to discover files: recents on open, global search by name, and folder browsing with breadcrumbs. This requires Drive LIST/SEARCH/metadata capability, distinct from M6a's content fetch (which reads a single known file's bytes). The picker must only offer files that can actually be attached.

**Decision:**

A separate read-only listing module (list recents, search by name, list folder contents, resolve folder path) gated through canExerciseCapability and using the existing token-exercise path and drive.readonly scope. A single source-of-truth maps each file's mimeType to (a) isSupported — true only for the exact set the M6a content client can resolve (allowed binaries plus native Google Docs/Sheets/Slides via export) — and (b) a coarse iconType for the picker's glyph. Search is global; folder browsing is breadcrumb-driven. Single capped page per call for v1 (no deep pagination yet).

**Reasoning:**

Listing and content-fetch are genuinely different Drive operations; keeping them as sibling modules sharing auth/token/error patterns is cleaner than overloading one. Centralizing isSupported here, matched to the content client's resolvable set, guarantees the picker never offers a file that would later come back unavailable — honest-state at the point of selection. drive.readonly already covers listing/search/export, so no new scope. Global search matches how users find files by name; folder browsing is the fallback for "I know where it is." Capped single-page is sufficient for the picker experience; pagination is a later rent.

**Consequences:**

- M6c2 renders this layer's DriveItem results directly; the picker is presentation over a proven data source.
- The supported-set is defined once and shared, so picker and content-fetch cannot drift on what's attachable.
- Folder path resolution powers clickable breadcrumbs.
- If deep folders/large folders need pagination later, it's an additive enhancement to this module.

## D-070 — Drive file picker: search-first with folder browsing, honest selection, live chip

Date: 2026-05-29
Status: Accepted

**Context:**

With the listing backend (M6c1) and the live-read engine (M6a) in place, users needed a way to find and attach Drive files without manual steps. Attorneys think in file names but also expect folder navigation as a fallback, so both were required.

**Decision:**

A picker in the chat composer's plus-button source menu. Search-first (recents on open, glob name search) with folder browsing via clickable breadcrumbs as a coexisting path on the same surface. Unsupported file types are shown but unselectable (honest-at-selection, backed by the listing layer's isSupported which matches the content client's resolvable set). A not-connected state invites connection rather than erroring. Selected files attach as live Drive attachments via the existing send plumbing; the chip renders the name instantly with a quiet live/Drive marker. Server-only listing functions are exposed to the client via server actions. Functional file-type and source icons are used (encoding meaning, consistent with the state-dot precedent). Folder browsing was built now, not deferred, as a deliberate fallback users will expect.

**Reasoning:**

Search matches how users recall files (by name); folder browsing is the reassuring fallback for "I know where it is", and building it now avoids a known-coming later addition. One shared list surface for recents/search/browse keeps it a single coherent tool, not two modes. Honest-at-selection (greying unsupported) prevents the attach-then-unavailable surprise. The live chip conveys the meaningful difference (current version, not a snapshot) quietly. Reusing the project's modal/menu/icon primitives keeps it native and dependency-free.

**Consequences:**

- The connector experience is end to end: connect Drive (settings) → pick a file (composer) → agent reads it live (run-time).
- The picker is presentation over the proven M6c1 data source and M6b send path; little new risk beyond UI.
- Agent-form Drive attachment (vs composer) can reuse this picker component later.
- Pagination and scoped-in-folder search are future refinements; global search + capped pages suffice now.

## D-071 — Retired the legacy integrations route in favor of settings/connections

Date: 2026-05-30
Status: Accepted

**Context:**

D-062 established /workspace/settings as the connections home and noted the old /workspace/integrations surface and rail group would be removed once the new location was complete and Connect CTAs repointed. With the connector hub built and proven (M1-M6), that time arrived.

**Decision:**

Removed the /workspace/integrations route tree (the Integrations and Connections coming-soon stubs) and the rail Integrations resource group, repointed all Connect CTAs (home Today card, Matters section) to /workspace/settings/connections, removed the dead breadcrumb entries, and added a redirect from the old paths to the new canonical location. The two retained-unmounted home Tools components (IntegrationsRow, IntegrationCard from D-061) were deleted as well, being unused dead code that still referenced the old path.

**Reasoning:**

The new location is the real, working connections home; the old surface was a placeholder retained only so arc milestones could land without breaking links. Keeping it now would be a redundant, confusing second entry point. The redirect preserves any bookmarked links defensively. A connection-status strip, if it ever returns (D-061), is a different concept and would be rebuilt fresh, so the dormant components carried no value worth their cruft.

**Consequences:**

- /workspace/settings/connections is the single canonical connections surface; the old path 308-redirects to it.
- The workspace rail's resource groups are now Knowledge / Workflows / Help; connections live in Settings, governed (eventually) in Admin.
- The `integrations` key on RailGroupsCollapsedValue is now unused but harmless (an optional persisted-pref field); left in place.
- Closes the routing-migration thread opened in D-062.

## D-072 — "use server" files export only async functions; types live in non-"use server" modules

Date: 2026-05-30
Status: Accepted

**Context:**

Saving an agent 500'd in production with `ReferenceError: AttachmentMetadata is not defined` on every agent (page GET fine, save POST failed). Root cause: `lib/actions/attachments.ts` (a `"use server"` module) re-exported a type with `export type { AttachmentMetadata };`. Next's server-action transform builds a runtime export registry for `"use server"` modules; the bare re-export of an imported binding was emitted as a runtime reference to a name that only ever existed as an erased type, so evaluating the action bundle on dispatch threw. tsc and `next build` both pass because the construct is valid TypeScript and the failure is runtime-only (the action is never dispatched during build). Introduced with the chat-attachments shared foundation (7928cae), latent until a save was attempted. Not an M7 regression.

**Decision:**

A `"use server"` module must export ONLY async functions. Types belong in a non-`"use server"` module (here `_attachment-shared.ts`, which is `server-only`); consumers import the type from there. Removed the re-export from `attachments.ts` and repointed `agent-attachments-section.tsx` to import the type from `_attachment-shared.ts`.

The bug class is specifically the bare re-export of an imported binding — `export type { X }` — in a `"use server"` file. A local type-alias declaration in such a file (`export type X = {...}`, including `export type Y = ImportedType`) is fully erased and emits no runtime binding, so it is safe; the codebase sweep confirmed those remaining cases (admin-users, agent-details, departments, message-attachments) are local declarations, not re-export specifiers.

**Consequences:**

- Agent create/save and agent-attachment add/remove POSTs no longer throw at module-eval time.
- Guardrail recorded so a future `export type { … }` (or any non-function export) is not reintroduced into a `"use server"` file.
- tsc/build cannot catch this class (runtime-only); the check is the convention plus the sweep done here.

## D-073 — Order-preserving auto-balanced two-column layout for capability groups (portable to admin)

Date: 2026-05-31
Status: Accepted

**Context:**

The Connections page moved to two columns for better use of width. A hand-placed split (specific groups in specific columns) would require manual re-balancing every time a group or provider is added, and could cause rows to stretch to fill uneven columns. The pattern will also be needed for the upcoming admin multi-group surfaces.

**Decision:**

Lay capability groups into two columns via an auto-balanced flow that preserves their meaningful order (not hand-placed), with content-height, top-aligned rows that never stretch (a shorter column simply ends higher; trailing whitespace is acceptable), collapsing to a single column on narrow viewports. Order is prioritized over perfect height-balance. All provider rows carry a uniform calm lighter fill at rest, with a subtle hover-deepen on actionable rows only; dots and fonts unchanged; the org row shares the common fill with its badge/status carrying ownership.

**Reasoning:**

Auto-balanced order-preserving flow stays polished as content changes with zero hand-tuning, avoiding the maintenance trap of hardcoded column placement. Content-height top-aligned rows eliminate the stretching failure mode. A uniform calm rest fill reads more pleasingly than mixed flat/tinted rows; the subtle hover-deepen is near-zero maintenance (adjusting an existing hover) and quietly distinguishes actionable from inert on top of the dots. The layout is built as a reusable pattern because the admin arc's multi-group surfaces need the same behavior (portability principle).

**Consequences:**

- Adding a group or provider re-flows automatically; no placement code changes, no stretching.
- The org row's ownership signal shifts from background tint to its badge/status (since all rows now share the fill).
- The layout pattern is a candidate for extraction into a shared helper when the admin arc adopts it. The split logic already lives in a portable primitive (`lib/layout/balanced-columns.ts`).

**Amendment (2026-05-31) — superseded by a responsive top-aligned grid:**

The balanced-height split was the wrong model. It optimized for equal column heights, but the actual goal was groups aligning on shared ROW lines. Two independent column stacks let the second group in each column start at a different vertical position (Calendar vs Messaging looked "off"), because each stack flowed independently. The fix is a true CSS grid (`grid-cols-1` collapsing up to `lg:grid-cols-2`, `align-items: start`): groups render in meaningful source order and flow left-to-right, top-to-bottom, and items in the same grid row share that row's top line for free, at their natural height with no stretching (ragged bottoms are intentional whitespace). This is both simpler (no balancing math) and correct (row alignment, not column-height balance).

Column count is capped at 2, within the settings family's shared `max-w-3xl` (768px) reading width — the most these rows fit without overflow at that width. A third column was declined: it would require widening Connections past the 768px that Profile, Display, and the settings landing all use, and the settings area's spatial coherence (a standard that also ports to the admin arc) outweighs one extra column on one page.

`balancedOrderedSplit` was retired and `lib/layout/balanced-columns.ts` deleted (this page was its only consumer). The portable pattern for the admin arc's multi-group surfaces is now the GRID model — responsive N-up (currently 2), order-preserving, top-aligned, natural-height, collapsing to a single column — not the balanced split. The rest of the original decision (calm rest fill, hover-deepen on actionable rows only, dots, fonts, content, org-row treatment) stands unchanged.

**Amendment (2026-05-31) — settings-family width raised to 896px; per-group header height reserved:**

The settings-family shared reading width was increased from 768px (`max-w-3xl`) to 896px (`max-w-4xl`), applied uniformly to all settings reading pages. 768px was sized for single-column reading; once settings went multi-column (the Connections grid) it felt cramped, and the upcoming admin arc has more multi-column / multi-component pages. 896px fits two columns comfortably (~430px each) while keeping all settings pages a single consistent width. The wider 1024px was declined earlier as too wide for a settings reading column; 896px is the deliberate middle. The "settings-family width" principle is now **896px** and ports to the admin arc's multi-column surfaces (superseding the 768px figure recorded in the amendment above).

The width is encoded once as `SETTINGS_PAGE_MAX_WIDTH` (`lib/settings/layout.ts`), consumed by both settings reading pages (the landing and Connections), so the "all settings pages share one width" contract can't silently drift. It is not in `app/workspace/settings/layout.tsx` because that layout intentionally imposes no `<main>` wrapper (the coming-soon Profile/Display stubs own their own centered `<main>`); those stubs are not reading pages and do not consume the width.

Separately, Connections now reserves a consistent title+tagline header height (`min-h-[2lh]` on the tagline — two of the element's own line-heights, type-scale-tracking, not a pixel guess) so provider rows start at the same vertical offset in every group and align across the whole grid, not only at the group tops, regardless of whether a tagline runs one line or two. Assumes a two-line tagline maximum (one-value change to `3lh` if that ever changes).

## D-074 — Admin information architecture: the two-job spine, four areas

Date: 2026-05-31
Status: Accepted

**Context:**

The admin section was placeholder-quality with an ad hoc structure. Opening the Admin polish arc, the IA was designed fresh around who the super-admin is (a legal leader who must justify and govern the tool) and what admin is for.

**Decision:**

Admin is organized around two jobs, GOVERN the use and MEASURE the value, made visible in both the rail (lead-line "Admin" anchor + two captioned groups) and the landing (grouped refined list). Four areas: People and Policy & access under GOVERN; Insights and Evals under MEASURE. A1 builds the shell (rail, landing, four coming-soon stubs); each area is built in a later milestone (Policy & access first, as its enforcement already shipped). Admin adopts the settings primitives (lead-line rail anchor, refined-list landing, the calm-rest/hover-deepen row language, the responsive top-aligned grid where useful, the 896px family width) and reconciles its width from 1024px to 896px. People and Policy are kept distinct (per-person/frequent vs org-wide/rare, different rhythms); Insights merges analytics and ROI as one section two lenses; audit log and data/retention fold into People/Policy rather than becoming separate destinations.

**Reasoning:**

The two-job spine gives admin a legible purpose a legal leader recognizes (prove it was worth it; keep it safe). Four purposeful areas earn their place; merging where rhythms match and splitting where they differ avoids both a junk drawer and artificial fragmentation. Building on the settings primitives makes admin instantly coherent with the product and is the portability principle paying off. Shell-first lets the structure be felt before functionality, and sequences the ready-contract feature (Policy & access, whose enforcement shipped in the connector arc) first.

**Consequences:**

- The four areas are coming-soon stubs after A1; later milestones build them (A2 Policy & access, A3 People, A4 Insights, A5 Evals; audit/retention fold in; docs close-out).
- The existing admin pages (calculator, metrics, user-access) retire per-page as their replacements ship; for now they stay reachable at their routes but are unlinked from the new rail and landing (the integrations-cleanup pattern). The unused `AdminCard` landing component was removed.
- Admin is now 896px, consistent with settings. The family width is lifted to one shared source, `SECTION_CONTENT_MAX_WIDTH` (`lib/workspace/layout.ts`), which `SETTINGS_PAGE_MAX_WIDTH` now derives from, so settings and admin cannot drift.
- The admin nav is data-driven (`lib/admin/nav.ts`), mirroring settings; both the rail and the landing render from it.

## D-075 — Filled rows are the landing standard (supersedes flat-hairline landings); admin left-justified

Date: 2026-05-31
Status: Accepted

**Context:**

The A1 admin landing used the filled calm-fill row treatment, while the settings landing still used an older flat-hairline treatment, and the admin landing and sub-pages were centered while the rest of the product is left-justified. Two inconsistencies to reconcile.

**Decision:**

Filled rows (the calm-fill, hover-deepen row language) are the standard for landing pages; the settings landing adopts it to match the admin landing, and the earlier flat-hairline landing treatment is retired. On a landing, every row is a navigation target, so every row hover-deepens (unlike Connections, where only actionable rows do). The admin landing and all four sub-page stubs are left-justified to match the settings surfaces. Both landings render the identical row treatment via a shared component (`components/workspace/landing-row.tsx`) so they cannot drift.

The shared standard is the filled-tile-with-hairline language (the same the Connections page uses): a calm `bg-paper-2` rest fill that deepens to `bg-secondary` on hover, with a hairline divider on the wrapper. Settings keeps its hairline dividers; the change there is flat-rest → filled-rest, not the removal of hairlines (removing them from settings while admin kept them would make the two non-identical, defeating the goal). Left-justification is achieved the same way settings does it — `w-full max-w-4xl` with no `mx-auto` — applied once at the admin layout so the landing and all four stubs left-anchor together.

**Reasoning:**

One coherent row language across landings (and consistent with the Connections rows) reads more considered than two different treatments. The operator preferred the filled treatment over flat-hairline when seen in practice. Left-justification is the established product-wide treatment; admin conforms. This supersedes the earlier "navigation stays light / landings are flat" note: in practice the filled treatment was preferred.

**Consequences:**

- Settings and Admin landings share one filled, left-justified row language through the single `LandingRow` component (lifted on the second consumer).
- Future landings use the filled row standard.
- The flat-hairline landing treatment is retired; the settings landing's earlier active-press micro-interaction is dropped in favor of the shared treatment.

## D-076 — Connection-policy editor (Policy & access, A2): category-level editing, derived providers, super-admin only

Date: 2026-05-31
Status: Accepted

**Context:**

The connection policy (allowed categories/providers, capability ceiling) shipped with live enforcement in the connector arc but no editing UI; it was changed directly in the database (D-066 deferred the editor). A2 builds it. The investigation established the contract: a global singleton, an org-wide single-dimension ceiling, two independently-editable arrays that can drift, super-admin-only write RLS, and no super-admin helper.

**Decision:**

The Policy & access page presents two governance decisions. (1) A single global capability ceiling as a trust statement: read only (the safe default) or read and write. (2) Allowed connection categories as toggles; `allowed_providers` is derived server-side from the allowed categories plus the registry (`deriveAllowedProviders`), never edited directly and never trusted from the client, so the two arrays cannot drift into the stranded-provider state. Editing is super-admin only, gated by a net-new `isCurrentUserSuperAdmin()` that mirrors the write RLS (D-041 mirror-RLS); other admins see the policy read only. The page distinguishes a read failure from a genuinely empty policy (it reads the row directly and treats `error || data === null` as load-failure → a calm error state) so the fail-closed deny-all sentinel from `getConnectionPolicy` is never shown as real state. The ceiling is presented as one org-wide control because the backend is org-wide single-dimension; per-category ceilings are a possible future schema change, out of scope.

**Reasoning:**

Category-level editing with derived providers makes coherence structural (the UI cannot create a contradictory policy) and gives the super-admin a simple mental model (think in kinds of connections, not providers). One global trust statement is more comprehensible for a legal leader than per-category ceilings and matches the backend. Super-admin-only matches the highest-stakes governance and the shipped RLS; read-only for other admins is honest transparency without granting change. This closes D-066.

**Consequences:**

- The policy is editable in-product; direct-DB edits are no longer needed.
- `isCurrentUserSuperAdmin()` now exists for super-admin-gated surfaces.
- `allowed_providers` is always coherent with `allowed_categories` by construction (`lib/connections/policy-derivation.ts`).
- Default model (net-new backend) and new-user-defaults (with People) are separate later milestones (A2b, A3).
- Per-category ceiling remains a possible future enhancement.

## D-077 — Profile menu as a consistent mode switcher from one shared modes source

Date: 2026-06-01
Status: Accepted

**Context:**

The profile menu modeled only a binary admin/not-admin state, so Workspace and Settings rendered the same menu (offering "Settings" while in Settings) with no current-mode marker, and the rail-switcher independently re-derived modes from pathname prefixes — two places duplicating the same logic.

**Decision:**

The profile menu is a consistent mode switcher showing the same set everywhere (Workspace, Settings, Admin for admins, Sign out) with the current mode shown but marked non-clickable (the disabled treatment). Both the profile menu and the rail-switcher derive modes and current-mode from one shared modes source (`lib/workspace/modes.ts`), with admin/settings prefixes tested before the workspace default. Admin is gated on `isCurrentUserAdmin` (any admin who can reach the admin section).

**Reasoning:**

A stable, complete switcher reads as deliberate and orients the user (a map of the product's areas) rather than a context-dependent grab-bag; marking the current mode is more consistent than omitting it. One shared modes source removes the duplicated prefix logic and prevents the rail and menu from drifting (lift-on-second-consumer).

**Consequences:**

- The menu is identical everywhere; the "Settings while in Settings" redundancy is gone.
- Modes are defined once; adding a future mode is one edit consumed by both the rail-switcher and the profile menu.
- The "Back to workspace" binary toggle is replaced by an explicit Workspace entry.

## D-078 — Org default model on the organizations row (super-admin), canonical models source, Opus 4.8 as new flagship default

Date: 2026-06-01
Status: Accepted

**Context:**

The only default model was a hardcoded literal scattered across several files, and the model list was duplicated in four convention-synced places. A2b adds a configurable org default model, consolidates the list, and adds the newly released Claude Opus 4.8 as the flagship default. Future direction: models as a connection.

**Decision:**

Org default model = `default_model` on the organizations row (org-scoped, app-level validated for forward-compat with connection-derived models), super-admin edited in Policy & access (read-only for other admins). It slots into agent-CREATE precedence (template, then org default, then the canonical fallback constant) and never the run path (snapshots immutable). All scattered model lists are consolidated into one canonical models source (ids, display names, pricing, composer-subset flag) feeding validation and every picker; this is the future models-as-a-connection plug-in point. Opus 4.8 (`anthropic/claude-opus-4-8`) is added as the flagship and the new default, joining the composer's three-model quick-pick (Opus 4.8, Sonnet 4.6, Haiku 4.5; older Opus versions remain in the full form picker). Sonnet and Haiku versions are unchanged; a model-lineup refresh is a separate future task.

**Reasoning:**

Org-scoped storage and app-level validation keep the multi-tenant and model-agnostic postures honest. Super-admin gating matches the surface and the cost/governance nature (Opus costs ~1.7x Sonnet; the default is a deliberate, configurable choice). Create-time-only precedence preserves snapshot immutability. Consolidation removes convention-only duplication and makes adding a model (like Opus 4.8) a one-place edit and the future connection-derived source a single swap.

**Consequences:**

- An org default model is configurable; Opus 4.8 is the new system default; the hardcoded Sonnet literal becomes the canonical fallback constant (now Opus 4.8).
- One canonical models source feeds validation, display, both pickers, and the editor.
- Models-as-a-connection plugs into this source later.
- Default model affects new agents only; existing agents and conversations unchanged.
- A future model-lineup refresh (newer Sonnet/Haiku, deprecations) is tracked separately.

## D-079 — People role editor with least-privilege role-escalation rule, tightened RLS, and role-change audit (A3a)

Date: 2026-06-01
Status: Accepted

**Context:**

The old users page could edit department access but not org roles (SQL-only), and the role-mutation RLS (users_org_admin_manage) was FOR ALL with no guard, so any org_admin could grant super_admin or demote one. Adding a role editor (the People area) makes that hole live, so A3a closes it. The role-assignment model follows the security-serious convention (least privilege, no self-escalation, separation of duties, lockout protection, audit).

**Decision:**

People replaces the users page's roster + access + defaults and adds an org-role editor governed by: a super_admin may set any role; an org_admin may manage user↔org_admin only and may not grant super_admin or modify a super_admin; the last super_admin cannot be demoted/removed (org-lockout protection); self-demotion requires confirmation. The rule is enforced in three layers (UI mirrors it honestly; the server action re-checks; a tightened RLS/trigger enforces it at the DB so no crafted request can escalate). Every role change is recorded to a role_change_audit table now (the audit-log UI is later, A6) because role changes are the highest-stakes mutation. The default-departments editor migrates into People (stays org_admin). Soft-deactivation (A3b) and invitation (A3c) are separate milestones; dept_admin assignment remains out of scope.

**Reasoning:**

The least-privilege/no-escalation convention is the industry standard for security-serious tools and is also the clearly-articulable model for customer security reviews. Enforcing in three layers (mirror-RLS, D-041) means the UI is honest and the database is the real guard. The DB layer is a BEFORE UPDATE trigger rather than pure RLS because the rule is value-comparison logic (actor role vs OLD.role vs NEW.role, plus a last-super-admin sibling count) that RLS WITH CHECK cannot express; the existing RLS is kept as the coarse who-may-write gate and the trigger adds the transition guard (and also closes a self-update role hole). The trigger writes the audit row so every committed change is captured exactly once, including direct SQL, before the viewer exists. Recording the audit from day one means the trail exists before the viewer does. Soft-deactivation over hard-deletion (A3b) keeps deprovisioning safe and reversible.

**Consequences:**

- Org roles are editable in-product under a safe rule; the SQL-only role change is retired.
- The privilege-escalation hole in users_org_admin_manage is closed.
- A role-change audit trail accrues, surfaced later in A6.
- The old users page is retired at the end of the People sub-arc (after A3c).
- A3b makes is_active load-bearing for soft-deactivation; A3c adds invitation.

## D-080 — Soft user deactivation, request-layer enforced and audited (A3b)

Date: 2026-06-01
Status: Accepted

**Context:**

Deprovisioning was hard-delete-only (destructive, prohibited, orphans agents); users.is_active existed but was inert. A3b makes deactivation a reversible soft block.

**Decision:**

Deactivation flips users.is_active and nothing else (no cascade, fully reversible; agents, connections, grants, conversations, audit all intact; grants left untouched and made dormant only by the access block). Enforcement is request-layer, not RLS: the proxy blocks a deactivated user on their next request (mid-session cutoff across pages, APIs, actions), the auth callback rejects new sessions for deactivated existing users (beside the allowlist rejection), and the workspace layout adds a page guard. RLS weaving was deliberately not done (the proxy chokepoint is sufficient; weaving is_active into the security-definer helpers is more invasive and redundant). Gating mirrors the A3a escalation rule (org_admin deactivates user/org_admin; only super_admin deactivates a super_admin); the last ACTIVE super_admin cannot be deactivated and self-deactivation is confirmed, enforced in UI, action, and a sibling enforce_user_deactivation trigger. The A3a role trigger's last-super-admin count was tightened to also require is_active, so a deactivated super_admin no longer counts as lockout protection. Every activation/deactivation is recorded to user_status_audit (trigger-written, viewer in A6).

**Reasoning:**

Soft-over-hard keeps deprovisioning safe and reversible and avoids the prohibited destructive path; legal orgs also need retention. The proxy is a guaranteed per-request chokepoint, so a request-layer block gives an immediate, complete cutoff without the invasiveness of RLS-weaving. Mirroring A3a's rule and protections keeps the people-governance model consistent and articulable. Auditing deactivation from day one continues the security-transparency posture.

**Consequences:**

- Users can be deactivated/reactivated safely in-product; no hard-delete path is introduced.
- is_active is now load-bearing (proxy, callback, layout).
- The last-active-super-admin guard protects against lockout; the A3a count is corrected for active status.
- user_status_audit accrues alongside role_change_audit, both surfaced in A6.
- A3c (invitation) completes People; the old Users page retires after it. Full multi-user testing of deactivation arrives with A3c.

## D-081 — Invitation flow via Supabase auth email, seamless acceptance, DB-backed gate (A3c) — People complete

Date: 2026-06-01
Status: Accepted

**Context:**

People could manage roster, roles (A3a), and deactivation (A3b) but had no way to add a person except the env-allowlist + magic-link auto-provision as role='user'. A3c adds invitation and completes People. The app sends no email; the service-role client and Supabase auth email already exist.

**Decision:**

Admins invite by email with a chosen role and departments, gated by the escalation rule (org_admin: user/org_admin; super_admin required for super_admin). The invite is sent via the service-role auth.admin.inviteUserByEmail (Supabase's existing email path, no new email infrastructure). Acceptance is seamless: ensure_user_provisioned consumes a matching pending invitation on first sign-in, provisioning the chosen role+departments and marking the invite accepted, with no separate accept step; escalation safety is enforced at invite creation (the role is validated then, since acceptance writes users.role via INSERT, which the 0048 role trigger does not guard). The env allowlist is replaced by a DB-backed async gate that admits an email if it has a pending/accepted invitation OR already belongs to an existing user, with the env list kept as a transitional safety hatch and no fail-closed-on-unset, so the owner and existing users are never locked out. Pending invites are managed (resend/revoke/expiry) on People, with the same gating. The old admin Users page is retired (People is the sole implementation, with a 308 redirect).

**Reasoning:**

Riding Supabase auth email avoids standing up email infrastructure for the MVP (a branded sender is a deferred polish). Seamless acceptance is the delightful user path (click, sign in, done) and is idempotent/automatic via existing provisioning. DB-gate-primary with an existing-user clause and env hatch is the safe-over-tidy choice that cannot lock out the owner. Creation-time role validation plus the invitation-role trigger keep invited roles within the escalation rule. Completing People lets the old Users page retire, removing the deliberate temporary duplication from A3a.

**Consequences:**

- People is complete (roster, roles, deactivation, defaults, invitation); the old Users page is retired with a redirect.
- Access is invitation-governed; the owner/existing users always admitted; env allowlist demoted to a safety hatch.
- A second user can now exist, making the A3a role editor and A3b deactivation fully testable.
- A branded custom invite sender and a Supabase SMTP config for volume are deferred ops/polish, not blocking.
- Invitation lifecycle events can join the A6 audit log later.

## D-082 — Insights usage/adoption lens (A4a), measured from usage_events; cost/ROI deferred to A4b pending the business model

Date: 2026-06-01
Status: Accepted

**Context:**

Insights is the first MEASURE area, serving Job C (run the operation + justify the spend). The investigation found usage_events is a fully-attributed, server-side ledger with measured activity (and cost), sliceable by user/agent/model/department/time, with a proven query pattern (impact-math.ts). Time-saved/ROI is not measured (only modeled from assumptions), and crucially the MEANING of cost depends on an unmade business-model decision (managed vs bring-your-own-model).

**Decision:**

A4a builds the MEASURED usage/adoption lens only — activity and trends by user, agent, model, and department (department via the agent, the clean rollup, since user-to-department is many-to-many), over calendar-anchored time windows, generalizing impact-math.ts to org-wide via the admin-read RLS. Cost and ROI/value are DEFERRED to A4b because cost_micro_usd means the customer's spend under bring-your-own-model but legalOS's internal margin under managed pricing, so an honest cost/ROI lens requires the business-model decision first (a new roadmap arc after Connections). A demo sample-data toggle (transient client state, clearly labeled) lets the experience be shown before real usage exists. Gating is org_admin (reporting, not a security control). JS-side aggregation is retained at current volume with a noted path to SQL-side aggregation if an org grows busy.

**Reasoning:**

The usage lens is meaningful and honest regardless of business model and is fully supported by existing data, so it ships now; the cost/ROI lens is gated on a strategic pricing decision and is deferred rather than built on an assumption that may prove wrong. Measured-vs-modeled and measured-vs-business-model-dependent are kept cleanly separated (the honest-state discipline).

**Consequences:**

- A real, demoable usage/adoption view ships now, business-model-independent.
- A4b (cost + ROI) is gated on the business-model arc (managed vs BYO pricing) and the org billing dimension it implies.
- The sample-data toggle supports demos; the old metrics/calculator pages stay reachable-but-unlinked until Insights fully covers their intent (after A4b).
- Heavy org-wide aggregation may later move to SQL-side; HEAD counts already scale.

## D-083 — Audit-log viewer (A6) — unified People activity feed over the existing audit tables

Date: 2026-06-01
Status: Accepted

**Context:**

The People work (A3a/A3b) has been recording role changes and account-status changes to two trigger-written, append-only, admin-read tables (role_change_audit, user_status_audit) with the plan to surface them. A6 is the read-only viewer and the capstone of the GOVERN side. No other governance events are event-logged today.

**Decision:**

A6 presents the two audit tables as ONE chronological feed with a per-row event type (role change / status change), org-admin gated (matching the tables' RLS), at a new route under the Govern nav group. User ids are resolved to friendly names via the established batched lookup; null actor/target (deleted user or direct-SQL change) render as "the system" / "a former member" — which also honestly reveals out-of-app changes. Initial render is server-fetched; pagination is most-recent-N with load-more (a UNION view / keyset cursor is noted as a future enhancement, not built). No new audit recording and no migration: A6 surfaces only what exists. The viewer is framed honestly as people/role/status activity, not a complete audit; Policy & access edits, connection grant/revoke, invitation lifecycle, and agent/department changes are NOT event-logged and are recorded as future audit gaps.

**Reasoning:**

The two tables' identical spine makes a unified feed the natural, superior UX. Surfacing the trail closes the loop opened when recording began and turns it into governance transparency (and a security-questionnaire asset). Honest framing avoids implying completeness. Deferring the broader audit-recording gaps keeps A6 scoped while capturing them so they are not lost.

**Consequences:**

- The role/status audit trail is now visible to admins in one place.
- Future audit-recording gaps (Policy & access edits, connection grant/revoke, invitation lifecycle, agent/department changes) are flagged for a future audit-coverage arc.
- Pagination/merge may move to a UNION view/keyset cursor at scale; a multi-tenant composite index is a future optimization.
- This capstones the GOVERN side (govern the use + see what was done); the admin arc closes out next (A7).

## D-084 — Admin arc close-out (A7): GOVERN complete, MEASURE intentionally deferred

Date: 2026-06-01
Status: Accepted

**Context:**

The admin arc (D-074 IA through D-083 audit log) is complete on its GOVERN side and deliberately stops short on its MEASURE side. This entry records the close-out and, importantly, why the MEASURE deferrals are deliberate rather than unfinished, so a future session does not mistake parked work for a gap to fill blind.

**Decision:**

Close the admin arc with the GOVERN side complete (Policy & access A2/A2b, People A3a/A3b/A3c, Audit log A6) and the MEASURE side deferred: Insights A4a shipped as a functional placeholder pending a delight pass; the Insights cost/ROI lens A4b is deferred pending the business-model decision (managed vs bring-your-own-model, which determines whether recorded cost is the customer's spend or legalOS's margin); Evals A5 is deferred as an open design question ("what is an eval for a non-engineer?"). A7 itself is docs-only: reconcile the roadmap/decisions/changelog and refresh the handoff so the honest state and every deferred arc survive.

**Reasoning:**

The GOVERN surfaces are fully supported by existing data and are business-model-independent, so they ship now. The MEASURE deferrals are each gated on something real (a pricing-model decision, a delight pass, a design conversation) and are worse if forced early on an assumption that may prove wrong. Recording the deferral rationale in the decision log keeps it articulable for trust/security contexts and prevents a future session from reconstructing or relitigating it.

**Consequences:**

- The GOVERN side is the durable, demoable governance story; MEASURE returns deliberately.
- The Connections phase (models-as-a-connection, notify-and-approve lifecycle, model-retirement handling) is the natural next major arc; the business-model arc follows it and gates A4b.
- The parked invite-email sending-domain item and the standing security-transparency lens are captured in ROADMAP.md and the handoff, not lost.

## D-085 — Generalize the connection adapter contract to a discriminated union by kind (flag 1a)

Date: 2026-06-01
Status: Accepted

**Context:**

The connector was built solely for OAuth data sources (the ProviderAdapter contract is OAuth-shaped). Models-as-a-connection (and later MCP, etc.) require the abstraction to host non-OAuth connection kinds. The investigation confirmed only providerId and capabilityCategory are provider-agnostic; all other members are OAuth-specific; and the contract broadens cleanly with no behavior change.

**Decision:**

ProviderAdapter becomes a discriminated union on a `kind` field. The provider-agnostic members (providerId, capabilityCategory) form a common base; the OAuth-specific fields and methods (and TokenBundle) live under kind:'oauth'. Google Drive becomes kind:'oauth'. The registry types against the union; the OAuth connect/callback routes narrow on kind (rejecting non-OAuth kinds) before touching OAuth members. No model kind is added in 1a — this step only makes the abstraction kind-aware with zero behavior change, the foundation the model-provider kind (1b) rides on.

**Reasoning:**

Doing the generalization in isolation, behavior-neutral, de-risks the riskiest area (the connector and, downstream, the chat path) by separating "the abstraction now supports kinds" from "a new kind works." A discriminated union is the idiomatic, type-safe way to host multiple connection mechanisms on one registry, and the OAuth-kind guard makes the routes correctly future-proof.

**Consequences:**

- The connection abstraction can host non-OAuth kinds (model providers next, MCP later) on one foundation.
- Drive and all current connection behavior are unchanged (the guard is never triggered today).
- 1b adds the managed model-provider kind and reworks the chat-route credential seam; 1c adds BYO keys; 1d the UI.

**Trust/architecture note (for the security-transparency lens / future trust docs):** the connector foundation is a single, kind-aware abstraction — one consistent, auditable connection model across data sources, model providers, and (later) MCP — rather than bolted-on per-type integrations. Supports the "one coherent, governable connection foundation" story.

## D-086 — Managed Anthropic model connection and the chat-route credential resolver (flag 1b)

Date: 2026-06-01
Status: Accepted

**Context:**

Building models-as-a-connection on the 1a kind-based abstraction. The chat route read the platform ANTHROPIC_API_KEY directly in one place (createAnthropicClient). To support managed and (next) bring-your-own-key model access uniformly, credential resolution must go through a resolver rather than a direct env read. The investigation confirmed a single key-read site and a single caller chain, so the hot-path rework is isolated.

**Decision:**

Added a kind:'model' adapter variant (the model-provider connection kind) and an Anthropic model adapter. Introduced a server-side credential resolver that the chat route calls with the org/user/vendor context already in scope; in managed mode it returns the platform ANTHROPIC_API_KEY, so chat behavior is identical. The single platform-key read moved into the resolver (still exactly one place). The resolver's return type includes an optional baseURL (for future self-hosted) and is structured so bring-your-own-key (1c) adds a clean branch (decrypt the org's stored key) without further hot-path change. No schema, category, stored row, or BYO logic in 1b — those land in 1c where BYO needs them. An unknown vendor does not resolve to Anthropic credentials (no future foot-gun). (Broadening the adapter union also re-typed the Google Drive adapter as its specific OAuthProviderAdapter variant so the existing OAuth-only token-refresh usage compiles against the now-two-member union; tokens.ts itself is unchanged.)

**Reasoning:**

Isolating the hot-path credential rework as a behavior-neutral step (managed lands on the same key) de-risks the riskiest surface before adding the new capability (BYO) on top. Resolving in the route (where org/user context lives) and passing the credential down keeps the streaming layer credential-source-agnostic. Deferring schema/category/row work to 1c keeps 1b minimal and the resolution path provable in isolation.

**Consequences:**

- Model credentials resolve through one seam that both managed and (next) BYO flow through; chat is unchanged today.
- 1c adds BYO: a stored, encrypted per-org model key (reusing the connection_secrets AES substrate) resolved by the same function, plus the model-connection schema/category and an optional configurable endpoint (self-hosted).
- The single platform-key read is centralized in the resolver.

**Trust/architecture note (security-transparency lens):** model credentials are resolved through a single, centralized, server-side seam — the foundation for per-organization credential isolation (bring-your-own-key) and for the managed-vs-BYO model that the business-model arc will price. Supports the credential-handling trust story.

## D-087 — Bring-your-own-key model connection backend (flag 1c)

Date: 2026-06-01
Status: Accepted

**Context:**

On the 1b resolver seam, 1c adds per-org bring-your-own-key model credentials. The investigation confirmed the connections schema fits a model connection with no column CHECK violated, org writes are already super-admin-gated, the crypto substrate takes a trivial key sibling, and grant-less service-role resolution is the natural fit.

**Decision:**

A BYO model connection is an org-scoped connections row (provider_id=vendor, capability_category='models', owner_user_id null, token_ref → an encrypted key in connection_secrets), governed as its own Policy & access control rather than through the data-source connection_policy gate (models are the engine, not a governed data surface; the read/write ceiling does not apply). Managed-vs-BYO is an explicit credential_source column (managed|byo) so an org can switch non-destructively without losing its stored key. A nullable base_url column is added now for future self-hosted. A unique partial index guarantees at most one active org model connection per vendor, making resolution deterministic. Model connections are grant-less and resolved via the service-role client (an org grant-less connection is super-admin-read-only under RLS, and the secret decrypt is service-role anyway). A key is validated against the provider before storing (cheap auth check) and only a masked hint is retained for display; the key lives only in encrypted connection_secrets, never returned or logged. The crypto adds a thin encryptApiKey/decryptApiKey sibling; model keys do not use the OAuth refresh path. The resolver's BYO branch uses the org's key when present, else managed, and tolerates the feature being absent so chat never breaks.

**Reasoning:**

Governing models separately from data-source connections keeps the policy vocabulary clean and matches where model governance already lives. An explicit credential_source enables a non-destructive managed↔BYO switch (a better UX than delete-and-re-enter) and is the natural billing distinction for the future business-model arc. Validate-before-store prevents saving a broken key. Grant-less service-role resolution matches "the whole org uses the org's key" and the RLS reality. Adding base_url now avoids a second migration for self-hosted.

**Consequences:**

- An org can bring its own model key (validated, encrypted, masked) and switch managed↔BYO without losing it.
- The chat route resolves the org's key when configured, else the platform key; managed orgs are unaffected.
- credential_source is the seam the business-model arc will meter (managed vs BYO pricing).
- base_url is ready for self-hosted; the connector UI (1d) builds the Policy & access control over these actions.

**Trust/architecture note (security-transparency lens):** an organization's model key is validated before storage, encrypted at rest (AES-256-GCM, service-role-only), never returned to the client or logged, and shown only as a masked hint — per-organization credential isolation for bring-your-own-model. A clean trust-page claim.

## D-088 — Model connector UI in Policy & access (flag 1d) — models-as-a-connection complete

Date: 2026-06-01
Status: Accepted

**Context:**

1a-1c built the model-connection foundation (kind-based abstraction, managed resolver, BYO backend). 1d is the configuration surface and the showcase "agnostic model connector."

**Decision:**

A model-connection control on Policy & access, super-admin-interactive and read-only for other admins, built on two legible axes — which provider (a provider-uniform grid: Anthropic available; Google, OpenAI, self-hosted coming soon) and whose credentials (managed vs bring-your-own-key for Anthropic). The Anthropic card surfaces the current state, a validate-before-store key entry with delightful validating→success/friendly-error feedback (a bad key is never stored), a non-destructive managed↔BYO switch (the stored key is retained), and replace/remove (remove is confirmed). The key is write-only in the UI (never re-displayed), shown only as a masked hint, never logged. Anthropic's fixed endpoint means no base-URL field (that surfaces for self-hosted later). Coming-soon providers use the same card shape (provider-uniform) in an honest coming-soon state. The org model-connection state is read service-side for the page (the org connection is grant-less and super-admin-read-only under RLS, so any admin can be shown the state). Reactivating a retained key after a switch to managed is by re-entry (validate-and-replace) given 1c's three actions; a one-line reactivate action is a possible later convenience.

**Reasoning:**

Two-axes-legible + provider-uniform makes the abstraction visible and the experience consistent across providers (the "agnostic" feel). Validate-before-store is a real delight and trust moment. Non-destructive switching avoids the delete-and-re-enter clumsiness. Write-only key handling and masked hints uphold the credential-isolation trust posture in the UI.

**Consequences:**

- Models-as-a-connection is complete and usable: an org can bring its own Anthropic key or use managed, configured in-product.
- The provider grid is the seam future providers (Google, OpenAI, self-hosted) light up into; self-hosted will surface the base-URL field.
- BYO is now fully testable through the UI (paste key, chat, confirm usage on the org's account).

**Trust/architecture note (security-transparency lens):** in the UI, an org's model key is validated before saving, shown only as a masked hint, never re-displayed or logged, and switchable without loss — completing the per-organization credential-isolation story end to end (backend + surface).

**Follow-up (switchToBYO):** 1d shipped with switchToManaged but no inverse, so returning to a retained key required re-entry. Added switchToBYO to complete the non-destructive round-trip the credential_source column was designed for: a super-admin-gated action that flips credential_source back to 'byo' in one click, but only when a retained key still exists (the connection has a token_ref and the secret is present), otherwise it asks for a key — so the resolver never finds a 'byo' row with no usable secret. The connector UI shows a one-click "Use your key again" when a key is retained in managed state, and the full entry flow only when none is. The managed↔BYO switch is now fully non-destructive both directions, no resolver/schema change.

## D-089 — The MCP connection kind and the un-bypassable trusted-server boundary (flag 2a)

Date: 2026-06-01
Status: Accepted

**Context:**

Flag 2 adds MCP as a connection kind for privileged legal data, under a locked trusted-only rule (first-party official allowlist or customer-self-hosted; never arbitrary third-party servers). 2a establishes the kind and the trust boundary as code before any connect capability exists, so the guarantee precedes the capability.

**Decision:**

Added kind:'mcp' to the connection adapter union and a code-level trusted-MCP registry that is the hard ceiling on connectable servers. Trust is DERIVED from this registry, never stored-as-authority: a server is first_party iff it is a registered allowlist entry, self_hosted iff via the partitioned customer-endpoint path, otherwise untrusted and unconnectable — there is no representable state where an untrusted server appears trusted. The code allowlist can only be widened by a reviewed deploy; per-org policy (built later) can only narrow it, never widen. The check is designed for both connect-initiate and callback (defense-in-depth), mirroring the existing OAuth gate. 2a is additive and behavior-neutral: no MCP client, connect flow, network, chat route, or schema change yet.

**Reasoning:**

For privileged legal data, the trust boundary must be a guarantee enforced in the architecture, not a guideline. Deriving trust from code (never from data) means no bug, drift, admin action, or tampering can make an untrusted server appear connectable. Establishing the boundary as pure structure before the connect capability (2b) means there is never a window where an untrusted connection is possible. Code-as-hard-ceiling with DB-only-narrowing matches the existing registry/policy architecture (the code registry is the universe, policy selects a subset).

**Consequences:**

- The abstraction can host MCP connections; 2b builds the OAuth 2.1 connect flow + MCP client + tools/list at connect; 2c the connector UI + per-org narrowing; Phase 2 the agent tool-use loop.
- The trusted-only guarantee is real code from the outset; untrusted servers are unrepresentable as connectable.
- A consolidated security-architecture document now champions this and the platform's other trust guarantees as articulable claims.

**Trust/architecture note:** this is a centerpiece trust claim — legalOS supports MCP but only first-party-vetted or customer-self-hosted servers can ever connect, enforced in code, derived not stored, narrowable not wideable. Captured in docs/SECURITY_ARCHITECTURE.md.

## D-090 — The MCP client capability (flag 2b-i)

Date: 2026-06-01
Status: Accepted

**Context:**

Flag 2 Phase 1 needs the ability to talk to a remote MCP server (handshake, list tools, later call tools). There was no MCP client capability in the codebase. 2b is decomposed into the client (2b-i), the OAuth 2.1 connect/auth flow (2b-ii), and tools/list-at-connect + storage (2b-iii); 2b-i builds the client in isolation.

**Decision:**

Added the standard @modelcontextprotocol/sdk (1.29.0) and a thin server-side MCP client module that, given a server URL and an optional bearer token, opens a Streamable HTTP connection, performs the MCP handshake, lists the server's tools, and maps them to the McpToolDescriptor type defined in 2a. A tools/call wrapper is defined for later (2b-iii/Phase 2) but unused here. The module handles connection/handshake/timeout errors cleanly without leaking tokens and always disposes the connection. It is fully isolated: nothing imports it yet; no connect flow, OAuth, chat route, UI, or schema change. The optional token parameter is the seam where 2b-ii's OAuth token attaches. (One minimal reconciliation: McpToolDescriptor.description became optional to match the SDK's Tool shape, where description may be absent.)

**Reasoning:**

Building the client capability in isolation, against the real SDK API (read before writing), de-risks the net-new MCP integration before wiring it into the connect flow. Accepting an optional token now means the OAuth flow (2b-ii) plugs in without reshaping the client. Keeping it off the chat route preserves Phase 1's full isolation from the hot path.

**Consequences:**

- legalOS can list a trusted MCP server's tools; 2b-ii adds the OAuth 2.1 connect/auth flow and the trust-gated connection creation; 2b-iii stores discovered tools and shows the connection connected; Phase 2 adds agent tool-use.
- The standard MCP SDK is now a dependency.

## D-091 — Generalize token-refresh dispatch by connection kind (flag 2b-ii-1)

Date: 2026-06-01
Status: Accepted

**Context:**

tokens.ts hardcoded the Google Drive adapter's refresh, so the credential-refresh path was Drive-specific. MCP connections (built next) refresh differently (the SDK's refreshAuthorization against the discovered auth server, with our stored client info), so refresh must dispatch on the connection's kind. This is the first, behavior-neutral step of the MCP OAuth flow (2b-ii), done in isolation because it touches the live refresh path.

**Decision:**

getUsableAccessToken now resolves the refresh strategy from the connection's kind: OAuth-kind connections resolve their adapter via the registry and refresh exactly as before (Drive unchanged); MCP-kind refresh is a marked placeholder until 2b-ii-2 (unreachable today, since no MCP connection can exist before the connect flow is built). The surrounding decrypt/expiry/re-encrypt logic is unchanged; only the single hardcoded refresh call became a kind-dispatched strategy, which also resolves the prior coupling where Drive's adapter was hardcoded rather than resolved via the registry.

**Reasoning:**

Generalizing the dispatch in isolation, behavior-neutral for the live Drive path, de-risks the refresh path before MCP refresh rides on it. The control-plane principle holds: refresh stays in our path, writing tokens back to our encrypted store; the SDK (in 2b-ii-2) is only the protocol mechanism for the MCP branch.

**Consequences:**

- Refresh routes correctly per connection kind; MCP refresh slots into its branch in 2b-ii-2 (the SDK's refreshAuthorization, secrets stored by us).
- Drive and all existing OAuth connections refresh exactly as before.

## D-092 — First-party MCP connect/auth flow with legalOS-owned credential custody (flag 2b-ii-2)

Date: 2026-06-01
Status: Accepted

**Context:**

Flag 2 Phase 1 needs to authenticate to trusted first-party MCP servers under the locked control-plane principle (legalOS owns credential custody; the MCP SDK is a protocol library). The investigation confirmed the SDK exposes OAuth 2.1 as discrete step-functions that return every secret to the caller, enabling Option A (we orchestrate via our routes, the SDK does the protocol, we store the secrets).

**Decision:**

Added an mcp-kind server adapter whose auth operations are discovery-backed (the SDK's discoverOAuthProtectedResourceMetadata / discoverAuthorizationServerMetadata resolve the real endpoints, registerClient performs RFC 7591 dynamic registration when no static client exists) and an MCP branch in the connect/callback routes that runs startAuthorization → exchangeAuthorization, storing the resulting OAuth tokens AND the registered-client credentials in our encrypted connection_secrets (custody ours; the SDK never holds them). The trusted-server boundary is enforced at two points (isTrustedFirstPartyServer at initiate, deriveMcpTrustTier must be first_party at callback), mirroring the existing two-point connection gate, so an untrusted server creates nothing. MCP refresh (the 2b-ii-1 placeholder) is filled with the SDK's refreshAuthorization, re-encrypting into our store. MCP connections are org-scoped, super-admin-gated, and grant-less. The RFC 8707 resource/audience param is passed where supported, leaving the seam for the future customer-IdP / audience-bound case. First-party only; the self-hosted partitioned path is 2b-ii-3; tools/list-at-connect is 2b-iii. The OAuth-2.0 Drive flow is untouched/behavior-neutral.

**Reasoning:**

Using the SDK's discrete step-functions (which return secrets to us) over our own orchestration keeps the most of our audited routes/crypto/tokens machinery and keeps every credential in our encrypted, governed, revocable substrate, the control-plane principle and the differentiator a regulated legal buyer requires. Discovery-backed endpoints (vs hardcoded) are what MCP requires and what makes the adapter generic across trusted servers. Two-point trust enforcement makes the trusted-only guarantee un-bypassable at the connect path. Building to the SDK's typed contract makes the flow correct by construction; live proof is deferred to when a real server exists.

**Consequences:**

- legalOS can authenticate trusted first-party MCP servers with full credential custody; 2b-ii-3 adds the self-hosted path; 2b-iii lists+stores the server's tools and shows it connected; 2c the UI; Phase 2 the agent tool-use loop.
- Credential custody (tokens + client registration) is entirely ours; the SDK is a protocol library, never the custodian, an articulable trust claim (added to the security-architecture narrative).
- The resource/audience seam is open for the future customer-IdP / audience-bound-token model.

**Trust/architecture note (security-architecture doc):** legalOS authenticates MCP servers via the open OAuth 2.1 standard but retains custody of every credential in its own encrypted, service-role-only vault, refreshed and revocable through its own path; the protocol library never holds the credentials; only allowlisted trusted servers can connect, enforced at both ends of the flow. Added to docs/SECURITY_ARCHITECTURE.md.

## D-093 — The self-hosted MCP partitioned path (flag 2b-ii-3)

Date: 2026-06-01
Status: Accepted

**Context:**

The trusted-only MCP rule permits exactly two tiers: first-party allowlisted (2b-ii-2) and customer-self-hosted. 2b-ii-3 adds the self-hosted tier — the customer's own MCP server, trusted because they own the infrastructure — partitioned from the first-party path so neither can be mistaken for the other.

**Decision:**

A self-hosted MCP connection is a super-admin-supplied https server URL (scope:'org'), with a self-hosted server identity that cannot collide with a first-party registry id, and trust tier 'self_hosted' derived from the path (deriveMcpTrustTier(serverId, isSelfHostedPath=true)) — never registry membership. The self-hosted flag and URL travel inside the signed state, so the callback re-derives the identical tier and the two paths cannot cross: a tamperer cannot flip self-hosted to first-party, an untrusted URL has no first-party entry (not in the registry) and via the self-hosted path only ever becomes self_hosted (the customer's own, super-admin-authorized), and trust is always derived (registry-wins), never read from a stored value. The flow reuses the 2b-ii-2 discovery-backed OAuth machinery against the customer's server, storing tokens and client info in our encrypted substrate (custody ours). Grant-less, org-scoped, super-admin-gated. First-party behavior is unchanged.

**Reasoning:**

Self-hosted is the customer's data-sovereignty escape hatch (their own server, their walls). Partitioning the two trusted tiers in code, with the tier carried in tamper-proof signed state and derived (never stored), keeps the trusted-only guarantee un-bypassable: there is no path by which an untrusted server becomes first_party, and the customer's own server is trusted only as self_hosted under super-admin authority. Reusing the 2b-ii-2 machinery keeps custody ours and avoids duplicating the auth flow.

**Consequences:**

- Both trusted tiers (first-party official, customer-self-hosted) can now connect, completing the trusted-only connect story; 2b-iii lists+stores the server's tools and shows connected; 2c the UI; Phase 2 the agent tool-use loop.
- Self-hosted pairs with self-hosted models for the maximal data-sovereignty story (own model + own MCP servers; privileged data never leaves the customer's environment).

**Trust/architecture note (security-architecture doc):** the two trusted MCP tiers are partitioned in code; trust is derived (registry-wins, then self-hosted-path, else untrusted) and carried in tamper-proof signed state, so an untrusted server can never become first-party and the customer's own server is trusted only as self-hosted under super-admin authority. Extended the MCP trust claim in docs/SECURITY_ARCHITECTURE.md with the self-hosted tier and the partition guarantee.

## D-094 — Discover and store the MCP tool catalog at connect (flag 2b-iii)

Date: 2026-06-01
Status: Accepted

**Context:**

With both trusted MCP tiers connecting (2b-ii), a connected server should show what tools it offers. The connect flow has the access token and server URL in scope; the 2b-i client can list tools.

**Decision:**

At the end of a successful MCP connect (both tiers), best-effort call listMcpServerTools with the just-exchanged token and store the returned catalog in a new nullable jsonb column connections.discovered_tools. Discovery failing does not fail the connection (connected-but-tools-unknown is a valid honest state, mirroring best-effort account-label fetch); the catalog can be discovered later. The catalog is stored at connect (read instantly for display, no per-render network call) rather than re-fetched live or normalized into a child table; refreshing it is an explicit future action, and the stored catalog is the substrate flag 4 (discovery) compares against. A read helper exposes the connection's identity, DERIVED trust tier (never stored-as-authority), status, and catalog for the connector UI (2c).

**Reasoning:**

Storing at connect makes display instant and offline-safe and avoids coupling rendering to server reachability; best-effort discovery keeps a momentary tools/list failure from blocking a valid connection; jsonb fits "the catalog is a property of the connection" without over-normalizing; and the stored-at-connect catalog is exactly what later discovery/refresh compares against. Deriving trust on read upholds the trusted-only guarantee (no stored trust read as authority).

**Consequences:**

- A connected MCP server shows its tools; 2c renders this; Phase 2 assembles/executes these tools in the agent loop.
- The stored catalog is the seam for a future explicit "refresh tools" action and flag 4 discovery.

## D-095 — The MCP connector UI in Policy & access (flag 2c) — MCP Phase 1 complete

Date: 2026-06-01
Status: Accepted

**Context:**

2a-2b built the trusted-only MCP connect backend (both tiers, legalOS-owned custody, tool discovery). 2c is the super-admin surface that makes it usable and makes the trust posture visible.

**Decision:**

An MCP connections section in Policy & access (super-admin-interactive, read-only for other admins), parallel to the Model connection section. Two connect paths, both visibly trusted: the first-party trusted servers from the code registry (shown honestly, including a not-yet-configured state where real endpoints/OAuth client are pending), and a self-hosted https-URL form (the org's own server). Connected servers render from getOrgMcpConnections with a DERIVED trust tier shown as an honest clear label, status, and the discovered tool catalog (or honest tools-unknown); disconnect is super-admin with confirmation. The trust story is visible by construction: only the vetted first-party list and the self-hosted-your-own path are connectable, with no generic add-any-server affordance, so the trusted-only guarantee is legible in the UI itself. The formal per-org allowlist-narrowing is deferred (connecting is the enabling act for now; the code allowlist stays the hard ceiling). The MCP connect routes were repointed to return to this admin page (where MCP connections are shown) rather than the user-facing data-source connections page.

**Reasoning:**

Making the trusted-only constraint visible (you can only connect vetted-first-party or your-own) turns the security posture into a UX the user can see and trust, not just a backend guarantee. Honest presentation of not-yet-configured first-party servers upholds honest-state. Deriving the trust tier on display keeps the guarantee truthful. Deferring formal narrowing keeps 2c focused; the hard ceiling already lives in code.

**Consequences:**

- MCP Phase 1 is complete: trusted MCP servers (first-party or self-hosted) can be connected and seen with their trust tier and tools, under super-admin governance, with legalOS-owned credential custody.
- Live first-party (Google) connection awaits the real-world setup (confirmed endpoints + a Google Cloud OAuth client); the UI lights up when configured.
- Phase 2 (the agent tool-use loop + Docs/Sheets export) is the next arc: agents assembling and calling these connected servers' tools.

**Trust/architecture note (security-architecture doc):** the trusted-only MCP posture is now visible in the product, only vetted first-party servers or the org's own self-hosted server are connectable, with the trust level shown plainly and no path to connect an arbitrary server. Appended to the MCP claim in docs/SECURITY_ARCHITECTURE.md.

## D-096 — Group MCP first-party servers by provider with expand/collapse (built to scale)

Date: 2026-06-03
Status: Accepted

**Context:**

The MCP connector UI listed first-party trusted servers as a flat list. That is fine for one provider (Google Workspace, five servers) but does not scale: as providers grow (Microsoft 365, Slack, matter-management, each with several servers), a flat list becomes an unwieldy wall.

**Decision:**

Group first-party servers by PROVIDER FAMILY with an expand/collapse per provider, built now (ahead of the second provider) so adding a provider later is "add entries," not "redesign under load." The registry gains a provider grouping key and a group-by-provider helper (additive; no trust, endpoint, or partitioning change). The collapsed provider row is the scannable overview (provider label, a one-line descriptor, and a status summary, e.g. "5 servers, available once configured" or "5 servers, 2 connected"); expanding reveals the individual servers with their trust pill and connect state. Smart default: a sole provider opens (it looks complete and there is nothing to hide); multiple providers start collapsed for a clean provider-level overview, with the user able to toggle any group. The expand state is transient (useState, no persistence). Self-hosted stays its own distinct block (the org's own server, not a vetted provider's catalog) with an instructional line, and the redundant first-party sub-line was removed while the section's emphatic trusted-only statement stays.

**Reasoning:**

Designing the scaling structure before the second provider avoids a redesign under load and makes the page read as intentional at one provider and tidy at many. The collapsed provider row keeps the overview fixed-height per provider regardless of how many servers each offers, so scannability holds at 1, 3, or 30 providers. The smart-default expand keeps today's single-provider view from hiding everything behind a chevron. Keeping self-hosted separate respects that it is categorically different from a vetted provider's catalog. Trust derivation, the partitioning, custody, and the placeholder endpoints are all unchanged.

**Consequences:**

- Adding a provider is data only (a provider-metadata entry plus its servers); the UI scales without change.
- The trusted-only posture stays visible by construction (only the vetted provider groups and the self-hosted-your-own path; no add-arbitrary-server affordance).

## D-097 — Pre-registered (static) OAuth client support for MCP servers without dynamic registration

Date: 2026-06-03
Status: Accepted

**Context:**

The MCP auth flow (D-092) always acquired its OAuth client via RFC 7591 Dynamic Client Registration: at connect time it registered a fresh client with the server's authorization server. That works for DCR-capable servers (and for the self-hosted path, where the customer runs a server that supports it), but the first intended first-party surface — Google's Workspace MCP servers — does NOT support DCR. Google requires a client PRE-REGISTERED out of band in the Google Cloud console, with its id/secret configured into the app. With only the dynamic path, Google could never connect; the connect would fail at registration. The static-client path is the gating step for the Google Workspace MCP servers (the registry entries that have carried to-be-confirmed placeholders since 2a).

**Decision:**

The trusted-MCP registry now DECLARES, per server, how its OAuth client is obtained: a `clientAcquisition` of `{ mode: 'dynamic' }` (the default, absent ⇒ dynamic) or `{ mode: 'static', credentialKey }`. The five Google Workspace entries declare `static` with credentialKey `GOOGLE_MCP_OAUTH`; everything else (and the self-hosted path, which omits the field) stays dynamic. For a static server, the flow reads a pre-registered client's id/secret from the env-var pair named by convention from the key (`GOOGLE_MCP_OAUTH_CLIENT_ID` / `GOOGLE_MCP_OAUTH_CLIENT_SECRET`), wraps them in the same client metadata a dynamic registration would have produced, and proceeds; it never calls `registerClient`. The two env vars are DELIBERATELY SEPARATE from the Drive data-source connector's `GOOGLE_OAUTH_*` pair — the MCP client is registered with different scopes and the MCP callback redirect URI. If a static server's creds are unset, `beginMcpAuthorization` throws `client_not_configured` and the connect fails cleanly with a specific, non-revealing admin message ("This server needs a configured OAuth client that isn't set up yet"); it never proceeds with an empty client, and the error never names the missing env var.

Custody is unchanged: the static client info flows into the SAME encrypted path as a dynamic one — sealed into the connect cookie, then stored in `connection_secrets` alongside the tokens — so refresh reads the stored client info and works identically. (Storing it, rather than re-reading env at refresh, keeps the MCP custody path uniform across both acquisition modes and avoids a second code path; the configured secret is a credential and belongs in the encrypted vault like any other.)

**Reasoning:**

Making acquisition a per-server registry declaration (not a global flag or an inferred property) keeps the trust registry the single source of truth for everything about a trusted server, and keeps the dynamic path — the existing, shipped behavior — exactly as it was (absent field ⇒ dynamic; self-hosted unchanged). The only thing that varies between modes is WHERE the client originates; discovery, the PKCE authorization, the token exchange, refresh, the trust gates, and custody are all shared. The separate env-var pair prevents the MCP client (different scopes, different redirect URI) from being conflated with the Drive connector's client, a conflation that would silently break one or both. Failing closed on unconfigured creds (rather than attempting a malformed flow) gives the admin an honest, specific signal without leaking the env-var layout.

**Consequences:**

- Google's Workspace MCP servers become connectable once their pre-registered client is provisioned and `GOOGLE_MCP_OAUTH_CLIENT_ID` / `GOOGLE_MCP_OAUTH_CLIENT_SECRET` are set; until then they fail the connect cleanly with the specific "not set up yet" message. (The discovery endpoints remain to-be-confirmed placeholders, finalized separately; this change adds the client-acquisition half of Google enablement.)
- Adding another DCR-less first-party provider is a registry declaration (`static` + a credentialKey) plus its env-var pair; DCR-capable and self-hosted servers need nothing.
- Additive and behavior-neutral for every existing path: no migration, no schema change, and the dynamic-registration flow is untouched.

## D-098 — Wire the real Google Workspace MCP endpoints; align the registry to the three offered servers (flag 2)

Date: 2026-06-03
Status: Accepted

**Context:**

With static-client support in place and the operator's Google Cloud project enrolled (Developer Preview) and the Drive/Gmail/Calendar MCP APIs enabled, the trusted-MCP registry's placeholder Google endpoints can be replaced with the real official URLs, confirmed verbatim from Google's own documentation/console.

**Decision:**

Set the three first-party Google Workspace MCP endpoints to Google's official global MCP server URLs (https://drivemcp.googleapis.com/mcp/v1, https://gmailmcp.googleapis.com/mcp/v1, https://calendarmcp.googleapis.com/mcp/v1), keeping their static client-acquisition (the pre-registered GOOGLE_MCP_OAUTH client). Removed the Docs and Sheets entries: Google does not offer dedicated Docs/Sheets MCP servers, so they must not appear in the trusted allowlist (which must accurately reflect real, vetted servers); Drive's create_file covers creating Docs/Sheets files for export. The three servers now report configured=true and render as connectable in the connector UI.

**Reasoning:**

The trusted allowlist is the hard ceiling on what can touch privileged data, so its entries must be real, authoritative Google endpoints (sourced from Google's own docs/console, not the open web where community Workspace MCP servers dominate) and must not include servers that don't exist. Keeping the allowlist accurate is part of the trust posture.

**Consequences:**

- Drive, Gmail, and Calendar are connectable via their official Google MCP servers using the pre-registered Google OAuth client; the live connect requires the GOOGLE_MCP_OAUTH credentials in Vercel (set) plus a redeploy, and migration 0052 for tool-catalog persistence.
- The Google Workspace provider group is Drive, Gmail, Calendar; Docs/Sheets are not separate servers (Drive covers their file creation).
- This is the gate to proving MCP connect live (the go-live proof-out) and, later, Phase 2 agent tool-use against these servers.

Trust/architecture note (security-architecture doc): the trusted first-party MCP allowlist holds only real, official endpoints sourced from the vendor's own documentation; servers the vendor does not offer are not listed.

## D-099 — Per-server OAuth scopes and forced account selection for static MCP servers (flag 2)

Date: 2026-06-03
Status: Accepted

**Context:**

The first live Google Workspace MCP connect failed with "Missing required parameter: scope" because the MCP authorization request, built around discovery-style auth, did not declare OAuth scopes; Google's OAuth requires them. Google also silently used the browser's default account, causing account confusion.

**Decision:**

First-party server registry entries declare their required OAuth scopes (the three Google servers carry the exact scopes from Google's official MCP configuration docs: Drive drive.readonly + drive.file; Gmail gmail.readonly + gmail.compose; Calendar the three calendar scopes). The auth flow passes these as the OAuth scope parameter in the authorization request, and adds prompt=select_account so the user always chooses which account to authorize. The dynamic/self-hosted path (no declared scopes) is unchanged.

**Reasoning:**

Static authorization servers like Google require explicit scopes up front (discovery does not supply them for this path); declaring them per server in the registry keeps the registry the source of truth for how each trusted server connects, and using Google's exact documented scopes keeps the request correct and least-privilege (readonly + file/compose, not full access). Forcing the account chooser prevents the silent-default-account problem for multi-account users.

**Consequences:**

- Google Workspace MCP servers can complete authorization (the scope error is resolved); operator must also add the scopes to the Google Cloud consent screen Data Access page and authorize with a Workspace (antinilaw.com) account, since the Internal consent screen requires an org account.
- The account chooser now appears for MCP OAuth, a better multi-account UX.
- Self-hosted/dynamic behavior unchanged.

## D-100 — Phase 2 MCP agent tool-use — design lock (2P-0)

Date: 2026-06-03
Status: Accepted

**Context:**

Phase 1 connects MCP servers and discovers tools; Phase 2 lets agents call them via a gated agentic loop on the chat hot path. The read-only investigation mapped the terrain (the chat hot path is strictly single-pass; web_search is a hosted tool that needs no execution loop; MCP tools are client-executed and require a model→execute→feed-back loop) and a 7-step decomposition. This entry locks the design; the full authoritative spec lives in `docs/PHASE2_MCP_TOOLUSE.md`.

**Decision:**

Six locked decisions: (1) **Namespacing** — connected tools are server-prefixed Anthropic custom tools `<shortPrefix>__<originalToolName>` (e.g. `gdrive__search_files`), satisfying `^[A-Za-z0-9_-]{1,64}$`, with a server-side routing map back to `{ connectionId, tokenRef, serverUrl, originalToolName }`. (2) **Governance** — two layers: the org connects a server (Phase 1, super-admin), and the agent author enables which connected SERVERS this agent may use (per-server granularity for v1; per-tool later); the loop exposes only tools from servers enabled-for-the-agent AND connected-for-the-org. (3) **Write policy (v1)** — auto-run read tools, BLOCK write tools (a write `tool_use` returns a `tool_result` saying it needs confirmation and isn't enabled, so nothing is silently sent/created/deleted), classified by captured MCP annotations (`readOnlyHint`/`destructiveHint`), with a conservative no-annotation ⇒ treated-as-write default; interactive write-confirmation deferred to 2P-7. (4) **Guards** — at most 8 tool rounds per turn and a ~240s wall-clock budget inside the route's 300s `maxDuration`, then a final model turn without tools. (5) **Token accounting** — one summed `usage_events` row per turn plus a new additive `mcp_tool_call_count` column; each round re-sends growing history, so cost grows super-linearly (the summed row keeps it truthful). (6) **Tracing** — reuse the `tool_calls` JSONB + token/PII-free structured logs; persist per call the server/connection, tool name, args SUMMARY, result status, and timing.

Plus the **build order** (2P-1 execution-resolution reader → 2P-2 tool mapping/namespacing → 2P-3 single-tool execution → 2P-4 read/write classification → 2P-5 per-agent governance → 2P-6 the gated loop → 2P-7 UI + optional interactive confirm), the **gating principle** (agents with no enabled-and-connected MCP tools take the byte-identical current single-pass path; the loop engages only when resolved tools exist and ships behind a flag), and the **correctness trap** (history replay must flatten a multi-call turn to the final assistant text + `tool_calls` JSONB so the string-based history stays uncorrupted; intermediate `tool_use`/`tool_result` blocks live only inside the turn's execution).

**Reasoning:**

Off-hot-path, behavior-neutral steps land first; the one hot-path change (the loop) lands last, gated and flagged, so no-MCP agents are byte-identical. v1 runs reads and blocks writes so the loop is proven safely before any agent takes a real action in a user's Gmail/Drive/Calendar; write-confirmation is a deliberate later step. Per-server agent governance mirrors the platform's existing two-layer pattern. The guards bound cost and runtime.

**Consequences:**

- The build proceeds in the locked order; everything before 2P-6 is off the hot path and behavior-neutral.
- v1 end state: read tools usable mid-conversation; write tools blocked pending confirmation; interactive confirm is 2P-7.
- New schema/governance to come: a per-agent server-enablement mechanism (2P-5, may carry an additive migration) and an `mcp_tool_call_count` column on `usage_events` (2P-6).
- 2P-1 (the execution-resolution reader) ships alongside this lock as the first scaffolding step.

## D-101 — Add a test runner around 2P-6 (deliberate deferral, not drift)

Date: 2026-06-03
Status: Accepted

**Context:**

The repo has no test runner today (no vitest/jest, zero `*.test.ts`), despite CLAUDE.md's testing aspirations. Phase 2 is introducing pure, high-value-to-test logic: the 2P-2 tool namespacing / truncation / `input_schema` normalization, the 2P-3 result and error shaping, and the existing trust-derivation (`deriveMcpTrustTier`). These are exactly the functions where assertions catch regressions cheaply.

**Decision:**

Add a lightweight vitest setup and backfill unit tests for these pure functions **around 2P-6** (with or just before the gated agentic loop), so the one hot-path change lands guarded by tests. Do NOT add the runner mid-arc during the off-hot-path scaffolding steps (2P-1 … 2P-5); writing unrunnable `*.test.ts` now, or bolting on test infra between small isolated commits, adds churn without protecting anything yet.

**Reasoning:**

The value of tests peaks exactly when the risky change (the loop) lands; that is the moment to have them green. Until then the scaffolding steps are pure additions verified by `tsc` + build and are individually low-risk. Introducing the runner as its own focused step (rather than smuggled into a feature commit) keeps both the runner setup and the feature commits clean. Recording the gap as a decision makes the deferral intentional and prevents it from reading as drift in a future audit.

**Consequences:**

- 2P-1 … 2P-5 ship without colocated tests (verified by typecheck + build); their pure functions carry described test plans in the task records and code comments meanwhile.
- A vitest setup + backfilled assertions (2P-2 mapping, 2P-3 shaping, trust derivation, and the 2P-6 loop's guards) land around 2P-6.
- Tracked as a near-term tech-foundation item in `docs/ROADMAP.md`.

**Follow-through (2P-6a, shipped):** vitest added (node env; `@/*` + `server-only` aliases mirror the app; tests excluded from the Next bundle by not being in the route import graph), with 30 unit tests across the 2P-2 mapping/namespacing/normalization, the 2P-3 result/error shaping, the 2P-4 classifier, and `deriveMcpTrustTier`. The only runtime edit was a behavior-neutral extraction in `execute-tool.ts`: the inline success/error shaping became exported pure functions `shapeToolResult` / `shapeToolError` (with `errorExecution` replaced by an `errorTrace` helper), composed identically by `executeMcpTool` — confirmed behavior-identical for every real input (`getUsableAccessToken` only throws `TokenUnavailableError`, `callMcpServerTool` only throws `McpClientError`, so `shapeToolError`'s type dispatch reproduces the prior per-catch mapping exactly).

## D-102 — MCP token refresh — request offline access, surface error'd connections, and separate manual-refresh from runtime error-marking

Date: 2026-06-03
Status: Accepted

**Context:**

MCP OAuth never requested a refresh token (the authorization request set only `prompt=select_account`, not `access_type=offline`), so Google never returned one and every MCP connection was stored with a null refresh token. The ~1-hour access tokens then expired and `getUsableAccessToken` could not renew them. A read-only investigation traced two observed bugs to this single root cause: (1) "refresh fails on all three Google servers" — `getUsableAccessToken` threw `no_refresh_token`; and (2) "disconnect removed all three" — the failed refreshes flipped all three to `status='error'` via `markConnectionError`, and the readers returned only `status='active'`, so the error'd connections silently vanished (they were hidden, not deleted; only Drive was actually disconnected, which is correctly scoped). The manual refresh also misreported a token failure as "could not reach the server" and mutated connection health as a side effect.

**Decision:**

Three coordinated fixes. (1) **Request offline access:** `beginMcpAuthorization` now sets `access_type=offline` and `prompt=select_account consent` on the authorization URL, so the server issues a refresh token (the consent prompt ensures it is re-issued for a returning user) while keeping the account chooser; the existing exchange already persists `refresh_token` into the encrypted bundle, so token renewal then works. Applied generally to every redirect-based MCP auth request (standard OAuth/Google params, harmless for servers that don't honor them). (2) **Surface error'd connections:** the DISPLAY reader (`getOrgMcpConnections`) now returns `status IN ('active','error')`, and the connector UI renders an error'd connection with a "needs reconnect" state (a muted-red dot/label) plus a Reconnect action (the same connect flow); the EXECUTION reader (`getOrgMcpExecutionTargets`) deliberately stays active-only, so an unhealthy connection is never offered to an agent. (3) **Honest manual refresh:** `getUsableAccessToken` gained a `markErrorOnFailure` option (default true — runtime/use-time callers keep marking a dead token unhealthy); the manual `refreshMcpServerTools` passes false (re-checking a server must not mutate connection health) and returns a typed message (token failure ⇒ "This connection needs to be reconnected." vs an `McpClientError` reach failure ⇒ "Could not reach the server.").

**Reasoning:**

Working token refresh is a prerequisite for both the manual refresh and the agent loop (2P-6). Honest-state means a lapsed connection is visible and recoverable, not silently hidden. A manual maintenance action should not mutate connection health; that side effect belongs to runtime/use-time token death (the loop hitting a dead token), where marking the connection error is correct and drives the reconnect prompt.

**Consequences:**

- New/reconnected MCP connections obtain and store a refresh token, so their access renews automatically.
- The three already-connected Google servers were stored WITHOUT a refresh token and must be **reconnected once** (re-consent) to gain one. (No data repair; the operator reconnects after this ships.)
- The two readers' purposes are now explicit and distinct: display surfaces error'd connections, execution returns only healthy ones.
- The agent loop (2P-6) can rely on refresh plus appropriate runtime error-marking (the default `markErrorOnFailure: true` path).
- `disconnectMcpServer` is unchanged (correctly scoped). No migration (the `status` column already exists).

## D-103 — Per-agent MCP-server governance (2P-5)

Date: 2026-06-04
Status: Superseded by D-104 (MCP-to-agent governance moved to the org level; the per-agent `enabled_mcp_servers` layer was removed)

**Context:**

The locked two-layer governance model (D-100) needs its agent-author layer: which connected MCP servers a given agent may use, plus the resolver the gated loop (2P-6) calls to build an agent's tool set. The org-connect layer (super-admin) shipped in Phase 1; the runtime token-refresh prerequisite shipped (D-102).

**Decision:**

A dedicated `agents.enabled_mcp_servers` jsonb column (default `'[]'`) stores the MCP server ids an agent may use — separate from `tools_enabled`, which is for Anthropic hosted-tool toggles (web_search); the two are distinct governance axes. The agent author enables per connected SERVER (v1; per-tool deferred), choosing only from the org's currently-connected servers (the agent form offers active connections as toggles, with an honest empty state when none are connected and a "needs reconnect" server excluded). Saves validate the selection against what's actually connected, dropping any non-connected id (the form's hidden field carries a JSON array the create/update/template-create actions parse and re-validate). The runtime resolver `resolveAgentMcpTools` intersects an agent's `enabled_mcp_servers` with the org's connected+healthy execution targets (`getOrgMcpExecutionTargets`, active-only) and maps the survivors (2P-2) to namespaced tool defs + a routing map. Persistence is a separate best-effort write tolerant of the column being absent (Postgres 42703 ignored), and the form/pages read the column tolerantly, so the code deploys safely before the migration is applied.

**Reasoning:**

A separate column keeps the two governance axes legible and independently evolvable. Per-server matches how authors think about granting access; finer safety (which tool calls auto-run) is the read/write classifier's job (2P-4), not the grant. Intersecting at runtime means disconnecting or erroring a server instantly revokes it from every agent with no stored grants to go stale, and an unauthorized or never-connected id contributes nothing — the two-layer guarantee. Building the resolver off the hot path keeps 2P-6 a clean wiring step.

**Consequences:**

- Agents can be scoped to specific connected servers; the create, edit, and template-create flows persist the selection; the duplicate-agent path starts a copy with no MCP servers (safe default; the author adds them on edit) — a noted minor follow-up.
- The gated loop (2P-6) calls `resolveAgentMcpTools(agent.enabled_mcp_servers)` to build the loop's tool set.
- Per-tool granularity is a documented future refinement.
- Additive migration 0053 (`enabled_mcp_servers` jsonb not null default `'[]'`); existing agents default to none enabled. RLS unaffected (rides the agents row).

## D-104 — MCP-to-agent governance is org-level, not per-agent (reverses 2P-5 / D-103)

Date: 2026-06-04
Status: Accepted

**Context:**

2P-5 (D-103) made MCP enablement per-agent (an `enabled_mcp_servers` column + agent-form toggles + `resolveAgentMcpTools`). But basic users author their own agents, so per-agent super-admin control is impractical and doesn't actually govern — the real, sufficient lever is at the org level. The per-agent layer was never wired into the chat route (2P-6 isn't built), so reversing it is clean.

**Decision:**

Remove the per-agent layer (drop the `enabled_mcp_servers` column via migration 0054; remove its schema/form/resolver code) and govern MCP-to-agent access ENTIRELY at the org level via two existing super-admin levers that BOTH must agree: (1) the Allowed-connections policy permits the `'mcp'` category — now a GOVERNED category in `connection_policy.allowed_categories` (added to `KNOWN_CATEGORY_IDS`; the Allowed-connections control offers it as a toggle; meaningful because the org also has non-MCP connection kinds), and (2) the server is connected AND healthy (Phase 1 + D-102). MCP defaults to PERMITTED (migration 0055 adds `'mcp'` to the existing policy row and the column default): connecting a server is already a deliberate super-admin act, so the category switch's value is the org-wide OFF override, not a second mandatory on-switch. The org-level resolver `resolveOrgMcpTools` intersects gate 1 (`isCategoryAllowed('mcp')`) with gate 2 (`getOrgMcpExecutionTargets`, active-only) and maps the survivors (2P-2) to `{ targets, toolDefs, routingMap }`. There is no per-agent enablement; basic users cannot configure MCP at all; proper agent use is a training/policy matter.

**Reasoning:**

With basic users authoring agents, per-agent gating neither scales nor governs; the super admin's connect + allow decisions are the real control. Gating on the Allowed-connections category gives that existing policy primitive a genuine job for MCP (an org-wide off switch) and reuses `isCategoryAllowed` rather than building a parallel system. `'mcp'` carries no OAuth providers, so `deriveAllowedProviders` ignores it (it gates the category only). Default-permitted avoids friction while preserving the org-wide kill switch.

**Consequences:**

- Governance is simpler and honest: Allowed connections governs MCP as a category; deny it (or disconnect/error a server) and the tools vanish for every agent at once.
- 2P-6 calls `resolveOrgMcpTools()` (no agent argument) to build the loop's tool set.
- The agent form is MCP-free again (web_search unchanged); no per-agent or per-tool MCP model.
- Migration 0054 drops `enabled_mcp_servers`; migration 0055 makes `'mcp'` a governed, default-permitted category. RLS unaffected (both ride existing rows). This supersedes D-103 (2P-5).

## D-105 — The gated agentic MCP tool-use loop (2P-6b)

Date: 2026-06-04
Status: Accepted

**Context:**

The finish line of Phase 2: the one hot-path change, wiring the built-and-tested pieces (2P-1 resolver, 2P-2 mapping, 2P-3 executor, 2P-4 classifier, 2P-6a tests) into the chat route so an agent can actually USE connected MCP tools mid-conversation. The chat route was single-pass (one model call, stream, persist one assistant message + one usage row).

**Decision:**

A multi-turn loop inside the route's SSE stream, DOUBLE-GATED so the highest-blast-radius change is isolated: Gate A is an explicit env flag `MCP_AGENT_TOOLS_ENABLED` (default OFF — only the exact string "true" enables; off ⇒ no MCP resolution at all, so the path is byte-identical, no extra DB read); Gate B is the natural has-tools gate (`resolveOrgMcpTools()` non-empty — the org permits the MCP category AND has a connected, healthy server). The loop engages IFF (flag on) AND (non-empty tools); every other request is byte-identical to the pre-2P-6b single-pass path (the event consumption was extracted verbatim into a `consumeStream` helper both paths share). In the loop: stream the model; if `stop_reason === "tool_use"`, for each tool_use look up the routing map, classify (2P-4) — READ ⇒ execute via `executeMcpTool` (never throws), WRITE ⇒ hold with a needs-confirmation `is_error` tool_result (v1: nothing is silently sent/created/deleted) — append the assistant turn (content blocks) + a user turn (tool_result blocks), and re-stream. Guards: at most 8 model rounds and a ~240s wall-clock budget (inside the 300s maxDuration), then a forced final no-tools turn. `chat.ts` accepts content-block messages and exposes `finalMessage` (stop_reason + content). Usage is summed across rounds into one `usage_events` row plus a new `mcp_tool_call_count` (migration 0056, tolerant of absence). History persists as the final assistant TEXT + the `tool_calls` JSONB (server, tool, args summary, status, timing, read/write) — the content-block tool turns are ephemeral model context, never persisted — so reload/replay stays string-based and uncorrupted.

**Reasoning:**

The flag plus the has-tools gate isolate the hot path so the live conversation flow is unaffected until deliberately enabled, and is instantly revertible (flip the flag, no deploy) if anything is wrong. Blocking writes proves the loop safely before any agent takes a real action in a user's Gmail/Drive/Calendar; interactive write-confirmation is the deliberate next step (2P-7). The 8-round + wall-clock guards bound cost and stay inside the serverless limit. Flattening history to final text + `tool_calls` preserves the existing conversation contract (the single-pass replay shape), the most likely place a multi-turn loop could corrupt state. Args are summarized (key names only) so the trace is token/PII-free.

**Consequences:**

- Agents can use connected MCP READ tools live, behind the flag; web_search continues to work alone and alongside MCP tools.
- Write tools are held with a needs-confirmation result; interactive write-confirmation + richer MCP tool-trace UI are 2P-7.
- Phase 2 is functionally complete behind the flag. Operator: apply migration 0056 and set `MCP_AGENT_TOOLS_ENABLED=true` to test live.
- The loop is the foundation for richer agent tool use.

## D-106 — Google Drive MCP data access blocked by Developer-Preview authorization gate (external dependency)

Date: 2026-06-04
Status: Resolved (2026-06-04) — root cause was a missing Workspace Developer Preview enrollment, now enrolled and confirmed; Drive reads verified live. See Resolution below.

**Context:**

The full Phase 2 agentic MCP loop (D-105) is built, tested (30 unit tests), gated (flag + has-tools), and proven end-to-end against live Google MCP servers: the loop runs multi-turn, tools resolve under org governance, tokens refresh, calls execute over the live transport (HTTP 200 from drivemcp.googleapis.com), and traces persist. The remaining failure is narrow: Google's Drive read tools (search_files, list_recent_files) return a tool-level error `isError:true` with the bare message "The caller does not have permission". A focused investigation (token-safe diagnostics persisted to the tool_calls jsonb, since the Vercel log reader was unreliable) verified that everything on our side is correct: the arguments are well-formed and unwrapped (the model sends the tool's declared `query`/`pageSize` params, per the discovered schema which exposes no `corpora` param); the stored token carries the requested scopes (`drive.readonly` AND `drive.file`, verified `ro=true file=true`); the dedicated MCP OAuth client is trusted in Google Workspace Admin API controls; the authorizing account is the steve@antinilaw.com Workspace account; and the base Drive API is enabled. Google's CallToolResult returns ONLY the bare one-liner — no structuredContent, no `reason`/`status`/`metadata`/help URL (confirmed by persisting the full raw result).

**Decision:**

Conclude that the block is a Google-side Workspace **Developer-Preview authorization gate** on Drive MCP data access, NOT a defect in legalOS (not the request, arguments, scopes, OAuth client, account, or the loop, all verified correct). Stop engineering on it; pursue resolution via Google's Developer Preview documentation/support separately. Remove the temporary investigation diagnostics (the MCP_DIAG console logs, the granted-scope reader, the debug-only arg/result/error/schema fields on the tool-call trace, the MCP_DEBUG_ALLOW_WRITES write-allowance flag — writes are blocked again per the v1 needs-confirmation policy), and KEEP the one durable observability win: a failed MCP tool call records a safe, bounded human-readable reason (`error_message`) on the persisted trace, so future MCP failures are diagnosable from the record (even when, as here, the only safe text is the server's one-liner).

**Consequences:**

- Phase 2 is functionally complete and demonstrable for the agentic loop; **live Google Drive data access is pending a Google-preview-side resolution** (tracked in docs/ROADMAP.md). The feature flag (`MCP_AGENT_TOOLS_ENABLED`) gates the loop meanwhile.
- The permanent tool-error reason surfacing (from commit c290d81) stays; all temporary diagnostics are removed; the request/argument/auth path, the loop, governance, gating, and the 30 tests are unchanged.
- Calendar reconnect remains a separate small open item; 2P-7 (tool-trace UI + interactive write-confirmation) is still pending.

**Resolution (2026-06-04): RESOLVED.**

The root cause was that Google Cloud project 738626459610 (legalOS-dev) was not enrolled in the Google Workspace Developer Preview Program. Enrollment was submitted and confirmed on 2026-06-04 — the program team confirmed the project's features are ready to use ("all the features in the program are now ready to be used"). Immediately after confirmation, Drive MCP reads were verified working live end-to-end against real Google Drive data: the agentic loop runs, the model calls `search_files`, the call executes over the live transport, and real files are returned and woven into the answer.

This confirms the diagnosis above: every legalOS-side configuration — OAuth client, requested scopes, app trust in Admin API controls, the authorizing Workspace account, the base and MCP APIs, the request/argument shape, and the agentic loop — was correct throughout. The sole blocker was the missing developer-preview enrollment, a Google-side prerequisite keyed to the Cloud project number. No legalOS code changed to resolve it. The lesson (the several easy-to-miss Google-side setup steps, and the long opaque failure they produced) is captured as a customer-onboarding roadmap item so a future customer is guided through the setup rather than debugging it blind.

## D-107 — Interactive MCP write-confirmation via pause-and-resume (2P-7b-i)

Date: 2026-06-04
Status: Accepted

**Context:**

The agentic loop (2P-6b, D-105) runs many model turns inside ONE serverless request and, in v1, silently blocked any write tool the model requested. Making writes human-approvable means pausing a mid-stream loop for an out-of-band Approve/Deny decision — something a single serverless request cannot await (the function would have to hold open for an unbounded human delay, fragile to timeouts and refreshes). The loop's content-block turns are also ephemeral today; only the final assistant text + the `tool_calls` JSONB persist, an invariant that keeps conversation replay uncorrupted.

**Decision:**

Adopt PAUSE-AND-RESUME ACROSS REQUESTS. On a write, the loop persists its resumable state plus the pending action into a tenant-scoped `mcp_paused_runs` table (storing the connection's `token_ref` pointer, NEVER a token), emits a `tool_confirmation_required` SSE event, and ends the request cleanly with the partial assistant message + a `tool_calls` trace marking the write `awaiting_confirmation`. A separate, owner-authorized decision (`POST /api/chat/confirm`) records the choice and RESUMES the loop in a fresh request: deny feeds the model a declined tool_result and continues; approve feeds an approved-but-execution-pending placeholder and continues (the write itself executes in 2P-7b-ii — no write fires in 2P-7b-i, preserving the v1 no-write guarantee). Confirmation is PER ACTION for v1 (each write decided individually; a turn with several writes pauses at the first and re-surfaces the next on resume). The streaming machinery (consumeStream, the loop, citation draining, persistence) was extracted to `lib/chat/assistant-stream.ts` so the fresh turn and the resume share one code path; the fresh path stays behavior-preserving, and with the feature flag off or no MCP tools present every request is byte-identical to before.

**Reasoning:**

Pause-and-resume is robust to timeouts and refreshes and is the correct human-in-the-loop foundation. It preserves the string-history + `tool_calls` invariant by keeping the content-block loop state in the paused-run record, not in message history (the resume UPDATES the same assistant message, so one user turn stays one assistant message even across the pause). The persisted loop state and pending input are the user's own conversation data, scoped to the owning user exactly like the messages they belong to (RLS mirrors conversations/messages); no secret is written — the resume re-resolves a live token via `getUsableAccessToken` from the stored `token_ref`, as the loop does today. Splitting execution into 2P-7b-ii lets the first real write land on a proven pause/resume mechanism.

**Consequences:**

- Writes become approvable: the conversation pauses and asks, instead of silently blocking. Deny is fully wired end-to-end; approve is recorded and resumed with a placeholder.
- 2P-7b-ii lifts the block on approve (executes the write on resume, then continues).
- Batch "approve all" and fuller reload-resilience polish are later refinements. A paused run abandoned without a decision records no usage for the tokens already spent (a minor v1 undercount). If the paused-runs table is unavailable, a write degrades gracefully to the legacy "blocked, nothing sent" hold.
- New migration `0057_mcp_paused_runs.sql` (tenant-scoped, RLS, no secrets); requires applying before the feature is fully functional, though the flag-off path is unaffected either way.

## D-108 — Approved MCP writes execute (2P-7b-ii) — Phase 2 complete

Date: 2026-06-04
Status: Accepted

**Context:**

2P-7b-i (D-107) proved pause-and-resume write-confirmation end to end: a write pauses the loop, persists `mcp_paused_runs` (loop state + the pending action, including the route's `token_ref` pointer and the tool input), and a separate owner-authorized decision resumes the loop. Deny ran live (declined tool_result → continue); approve was deliberately a placeholder that resumed WITHOUT executing the write, so the highest-consequence step (mutating the user's Google data) could land on an already-proven mechanism. 2P-7b-ii lifts that block.

**Decision:**

On an owner-approved resume, EXECUTE the pending write through the SAME executor reads use (`executeMcpTool`): reconstruct the route from the persisted `pending_tool_call` and resolve a fresh access token live via `getUsableAccessToken(connectionId, tokenRef)` inside the executor — only the `token_ref` pointer is ever persisted; no stored token is read or logged. Feed the REAL tool_result (success or `is_error`) back for the pending `tool_use` id, continue the loop so the model reports what it did, and settle the trace entry to its real terminal status (`done` | `error`, with the safe `error_message` on failure) so the friendly UI (2P-7a) shows an actually-executed write, e.g. "Google Drive: create file · Done". Deny is unchanged. The write executes AT MOST ONCE: the atomic `pending → resuming` claim made in `/api/chat/confirm` (an `UPDATE … WHERE status = 'pending'` that returns zero rows on a second call) gates entry to the executing resume, so a double-click or retry cannot fire the write twice. Only the approve branch changed; the pause/persist mechanism, schema, auth/claim, and UI are untouched.

**Reasoning:**

Landing the first real write on the already-proven pause/resume mechanism keeps the mutate-user-data step minimal and isolated. Reusing the read executor means writes go through the same vetted, never-throws, token/PII-safe path (live token resolution, custody ours, bounded result, `is_error` on failure). Per-action human approval is the safety gate; a server-side write failure surfaces as an `is_error` result the model narrates gracefully, with the trace distinguishing executed-ok from executed-error, and the run still reaching `resumed` (the decision was honored, the write attempted).

**Consequences:**

- Agents can now take real write actions, but only with explicit, per-action human approval. **Phase 2 (the full agentic MCP tool-use loop — governed reads run freely, writes require human approval) is complete and proven live.**
- The history invariant holds: message history stays final text + `tool_calls` JSONB; the executed write's content-block tool_result lives only in the resumed loop state, so follow-up turns replay uncorrupted.
- No schema change, no migration. Reads, resolver, classifier, governance, gating, trust/custody/endpoints, and the flag-off / no-MCP path are all unchanged.
- Later refinements remain: batch "approve all" (per-action only today) and abandoned-run usage accounting (D-107). The placeholder result helper from 2P-7b-i is retained for deny; its approve branch is now unused.

## D-109 — Per-user calendar is MCP-only and admin-controlled (no user opt-in)

Date: 2026-06-05
Status: Accepted (forward-looking; the arc is not yet built)

**Context:**

The workspace-home "Today" card is meant to show a user their schedule, but it was built (Reading-1, D-057/D-058) against a per-user `'calendar'` capability category checked via `connection_grants` — a per-user calendar-OAuth path that never shipped. Meanwhile the actual Google Calendar integration arrived via the org-level MCP path (category `'mcp'`, grant-less, org-scoped), which the card cannot see, so it reads "not yet connected" despite a working Calendar MCP. Planning the per-user calendar arc forced two questions: which connection path it should use, and whether users opt in.

**Decision:**

(1) **MCP is the only Google/Workspace path.** Per-user calendar is built by adding a PER-USER dimension to the MCP connection model (org-scoped today), NOT by introducing a separate per-user calendar-OAuth connector. (2) **Admin-controlled, the user has no say.** When the super admin enables/connects per-user calendar for the org, it connects for users; the user does not opt in or choose. The super admin's decision IS the grant. Per-user calendar is the first instance of the per-user-MCP capability, which is intended to be reusable for later per-user Workspace connections (Gmail, Drive).

**Reasoning:**

A second Google connection path (MCP for agents + OAuth for the home) would re-create the dual-path entanglement the org-level-MCP-governance decision (D-104) deliberately collapsed: two credential custodies, two trust derivations, two governance surfaces for the same provider. Keeping MCP as the single Google path means one custody model, one trust derivation, and one governance lever. Admin-controlled (no user opt-in) is consistent with the org-level MCP governance pattern (D-104): the admin sets it, and proper use is a policy/training matter rather than a per-user toggle — which also keeps the experience simple for both the user (their calendar is just present) and the admin (one clear control, not a fiddly per-user setup).

**Consequences:**

- The per-user calendar arc replaces the dormant per-user-`'calendar'` `connection_grants` check in `calendar-connect-card.tsx` with the per-user-MCP path; the already-built `today-schedule.tsx` view lights up once the per-user MCP dimension exists.
- The MCP connection model gains a per-user dimension (a real schema/identity change to the currently org-only `connections` MCP rows). This is the substantive work of the arc, reusable for per-user Gmail/Drive later.
- Recorded in `docs/ROADMAP.md` ("Future arcs identified during Connections-phase planning") alongside the Matters and Desk arcs. The small "Calendar MCP reconnect" open item is effectively superseded by this arc.

## D-110 — Platform owner as a separate cross-tenant capability (C4L/platform arc Step 1)

Date: 2026-06-05
Status: Accepted

**Context:**

The C4L content-library refresh (and future platform features: billing, cross-customer analytics, tenant management) needs a PLATFORM-administration tier ABOVE the org-scoped `super_admin` — legalOS-the-vendor governing the platform across customers, not a customer governing their own org. Today the top role is `super_admin`, scoped to the single org; there is no cross-tenant authority. Step 1 of the combined C4L + platform-owner arc builds that foundation (the role + gate + a minimal surface) so the later steps have a home.

**Decision:**

Model `platform_owner` as a SEPARATE, ASSIGNABLE cross-tenant grant — a standalone `platform_admins` table (user_id pk), NOT a rung in the org `user_role` enum. Gate it with `isCurrentUserPlatformOwner()` / `requirePlatformOwner()` (mirroring `isCurrentUserSuperAdmin` / `requireAdminUser` one tier up; a mere `super_admin` does NOT pass). Surface it in a distinct, minimal platform-admin area at `/workspace/platform` with its own `requirePlatformOwner()`-gated layout and a scalable card-style landing (driven by an empty `PLATFORM_NAV_GROUPS`, mirroring the org admin shell), reachable only via a "Platform" profile-menu entry + rail shown only to a platform owner. Grant it to the operator's existing account for now (data, by email lookup in migration 0058), reassignable later (e.g. a future legalos.com address) and grantable to future platform engineers. NOT self-grantable: the table has RLS with only a read-own SELECT policy and no write policy, so the grant is settable only by the service role (migration, or a future platform-owner-only action).

**Reasoning:**

Cross-tenant administration is a DIFFERENT AXIS from org roles — a platform owner is not "a higher org role" — so modeling it separately stays honest as the schema becomes truly multi-tenant, and lets one person hold both an org role (super_admin in their org) AND the platform capability without conflating the two. A standalone grant table is also the safest "not self-grantable" representation: a boolean on `users` would be writable via the existing `users_update_self` RLS policy (a self-grant hole), whereas a separate table with no write policy denies all user writes by default. Building the surface lean-but-scalable (an empty nav source + an honest "more coming" landing) lets the C4L refresh button (Step 3) and future platform features land as added entries without rework, while shipping nothing speculative now.

**Consequences:**

- The C4L refresh button (Step 3) and future platform features (billing, cross-tenant analytics/management) have a gated home; `platform_owner` and any org's `super_admin` remain separable concerns.
- Migration `0058_platform_admins.sql` (cross-tenant grant, RLS read-own-only, granted to the operator). Code is deploy-tolerant: the reader fails closed to "not a platform owner" if the table/grant is absent, so the surface 404s for everyone until the migration is applied; the rest of the app is unaffected.
- The platform surface lives under `/workspace/platform` (inheriting the workspace chrome so it matches the admin register natively) rather than a top-level `/platform` console; a separate console can come with true multi-tenancy. No change to the org admin area, the `user_role` enum, or any existing gating.

## D-111 — Safe, placement-preserving C4L import + persisted mapping (C4L/platform arc Step 2)

Date: 2026-06-05
Status: Accepted

**Context:**

C4L content was imported by a one-shot CLI (`scripts/import-c4l-plugin.ts`) that upserts agents keyed on `(organization_id, slug)` with a stable `c4l-<plugin>-<skill>` slug and a `source_origin` provenance stamp, placing each agent from a `--department` CLI argument. Two things blocked a safe platform-owner refresh button (Step 3): (1) the plugin→department placement lived ONLY in the operator's past CLI invocations, not persisted anywhere a button could reapply; and (2) the import set `is_active=true` UNCONDITIONALLY, so a re-run would RESURRECT the non-agent skills the operator deliberately soft-deleted via the `0024`-style filter migrations — undoing curation, the single most important correctness risk.

**Decision:**

Persist the plugin→department mapping as VERSION-CONTROLLED CODE CONFIG in a vendor-content registry seam (`lib/content/vendor-registry.ts`: a `VendorContentProvider` type + the `CLAUDE_FOR_LEGAL` entry with `pluginDepartmentMap`), derived from live state so it matches reality exactly, mirroring the trusted MCP-server registry (mapping-as-code, not a DB table, no migration). Refactor the import into a reusable server function (`lib/content/c4l-import.ts`): a PURE `planC4LImport` core holding all safety logic + a thin `importC4LContent` executor over an injectable `C4LImportStore`, accepting already-parsed skills as input (Step 3 feeds GitHub-fetched data). The safety rules: NEVER reactivate a soft-deleted/filtered row (skip, never touch is_active/deleted_at); place new agents ONLY from the persisted mapping; apply a CONSERVATIVE NON-DESTRUCTIVE update policy — an existing active row is never modified, and source-owned content drift (name/description/system_prompt) is REPORTED for an explicit later review/apply rather than auto-overwritten, so admin edits, admin moves (placement), and active/filter state are all preserved; keep the idempotent stable-slug upsert so re-import only inserts genuinely new skills and conversation history (agent-id references) is never broken. A plugin absent from the mapping is COLLECTED into `unmappedPlugins` and imported nowhere — never guessed into a department, never dropped silently.

**Reasoning:**

Making the refresh safe in ISOLATION, before Step 3 wires a button to it, is the de-risk discipline this arc follows (the highest-consequence operation — mutating the curated library — lands on proven-safe logic). Protecting the operator's curation is the non-negotiable correctness requirement, so the import respects the soft-delete filter as a skip signal (per migration 0024's own comment). The conservative "never overwrite an existing row, report drift instead" policy is the only policy that genuinely preserves admin edits given there is no stored content baseline yet to distinguish edited from unedited rows; auto-applying upstream updates to known-unedited rows is deferred until such a baseline exists. Mapping-as-code matches the trusted-registry pattern (platform-owner-owned, PR-reviewed, not tenant- or runtime-mutable) and is the seam the multi-vendor provider registry (Step 4) grows from.

**Consequences:**

- Step 3's button calls a proven-safe function; curation is protected across refreshes; uncategorized new content is surfaced for a platform-owner decision rather than guessed.
- The mapping is derived from live state and reported for operator confirmation; if a placement differs from the codified constant, the constant is corrected (it is version-controlled, a one-line change).
- The legacy one-shot CLI is SUPERSEDED for refreshes (it would resurrect filtered rows and uses `--department`); a header note directs maintainers to the safe function. It remains only as a manual first-import escape hatch.
- Also (operator data cleanup, not code): removed the stale `platform_owner` grant on `steve@antinilaw.com`, leaving `steveantini@gmail.com` as the sole platform owner, per the two-identity model (personal account = platform owner; antinilaw.com account = customer-experience test identity).

## D-112 — Platform-owner C4L refresh button (C4L/platform arc Step 3)

Date: 2026-06-05
Status: Accepted

**Context:**

Step 2 made the C4L import safe and reusable (`importC4LContent`: insert-new-only, never resurrects filtered rows, places from the persisted mapping, reports drift/unmapped) but left it un-triggered. The goal of the arc — "push a button to pull the latest curated content, don't re-code each update" — needs a runtime fetch of the public C4L GitHub repo plus a platform-owner-gated trigger on the Step 1 platform surface.

**Decision:**

Add a runtime fetcher (`lib/content/c4l-fetch.ts`) that reads the public repo with TWO GitHub API calls (repo metadata for the default branch + one recursive git-tree) and then reads each mapped plugin's `SKILL.md` from raw.githubusercontent.com (a CDN, not subject to the API rate limit), so a refresh costs 2 API calls regardless of skill count and a manual button cannot exhaust the ~60 req/hr unauthenticated limit. A strict `^<plugin>/skills/<skill>/SKILL.md$` path filter selects only first-party plugin skills and naturally excludes `external_plugins`, `managed-agent-cookbooks`, and non-plugin dirs; every first-party plugin found is reported so upstream plugins we don't map are surfaced. Parsing reuses the original import's gray-matter parse (moved to a runtime dependency) for exact parity, so content-drift comparisons are apples-to-apples. A platform-owner-gated server action (`refreshC4LContent`) composes fetch → safe import → report and returns a PII-safe summary; the platform Content library page (`/workspace/platform/content`, the first real `PLATFORM_NAV_GROUPS` area) renders a "Refresh from source" button + the result. Unmapped upstream plugins and upstream content drift are REPORTED, never applied (conservative). The fetcher never throws (typed `{ ok: false, error }` on rate limit / network / truncated tree).

**Reasoning:**

Landing the trigger on Step 2's proven-safe import keeps the operator's curation intact by construction (the button can only insert new content; it can't resurrect filtered skills or overwrite edited agents). The git-tree + raw-CDN strategy is the API-frugal way to read a whole repo without authentication, and reusing the original parser avoids spurious drift reports. Surfacing decisions (apply this update? map this new plugin?) rather than making them silently matches the notify-and-approve posture the arc uses elsewhere; applying drift and assigning unmapped plugins are deliberately later actions (Steps 4-5).

**Consequences:**

- The platform owner self-serves content refreshes from the public source; super admins cannot. Filtered content stays filtered; existing agents are never overwritten; conversation history is untouched (insert-new-only, stable slugs).
- Applying upstream content updates and assigning departments to unmapped plugins are future actions; the multi-vendor bucket split + provider registry (Step 4) and super-admin governance + notification (Step 5) follow.
- `gray-matter` moved from devDependencies to dependencies (runtime use). No migration; no change to how C4L agents render or are gated.

## D-113 — Vendor-agnostic content structure (C4L/platform arc Step 4)

Date: 2026-06-05
Status: Accepted

**Context:**

The launchpad collapsed ALL externally-sourced agents into one bucket (`source_origin IS NOT NULL`) rendered under a hardcoded "Claude for Legal" section title. Provenance was already structured (`source_origin = "<sourceId>:<plugin>/<skill>"`, parsed by `lib/agents/source.ts`), and Step 2 added `lib/content/vendor-registry.ts` (the C4L provider entry). To make adding a second provider (e.g. a future OpenAI legal library) a registry entry + import adapter rather than a rearchitecture — the provider-agnostic pattern the connector/MCP registries already use — the single hardcoded bucket needs to become a registry-driven, source-split, dynamically-titled structure.

**Decision:**

Generalize the seam into a vendor-content PROVIDER REGISTRY as the single source of truth for provider metadata (`vendor-registry.ts` gains `getVendorProvider` + `VENDOR_PROVIDER_ORDER`), and RECONCILE `source.ts` to read from it: `AgentSourceId` relaxes to open `string` (vendors are extensible; known ones live in the registry), `getSourceDisplayLabel` reads the registry (humanized fallback for an unregistered id), `parseSourceOrigin` accepts any well-shaped source id (no longer rejects unregistered ones), so there is one source of truth, not two. `getAgentsForDepartmentLaunchpad` returns `externalGroups` (one group per source/vendor) via a pure, unit-tested `groupAgentsBySource` (orders registered providers first, unknown ids alphabetically; agents within a group preserve the existing sort). The launchpad renders one dynamically-titled `CollapsibleSection` per vendor present; per-vendor collapse state is keyed independently, with the legacy Claude for Legal section retaining the `externalAgents` key so existing user preferences survive (`CollapsedSectionsValue` opened to a string-keyed map). Empty-state: a SINGLE section (not one per registered provider), titled with the sole provider's label when there is exactly one (so the single-vendor case is behavior-identical to the old single bucket), else a generic "Curated content". BEHAVIOR-NEUTRAL with C4L as the only provider today; no migration (the split is computed from existing `source_origin` data).

**Reasoning:**

Provider-agnostic structure mirrors the connector/MCP trusted-registry pattern and the project's core commitment; one source of truth (the registry) prevents the labels/ids drifting across two lists. Doing it as a behavior-neutral structural refactor BEFORE any second vendor exists keeps the eventual addition trivial (a registry entry + adapter) and de-risks it (the structure is proven against the real C4L data first). Preserving the legacy collapse key for C4L avoids resetting any user's existing section preference. Relaxing `parseSourceOrigin`/`AgentSourceId` is safe for today's data (the only source is registered) and is the correct posture for an extensible vendor set.

**Consequences:**

- A second content provider is an incremental add (a registry entry + its import adapter) and appears in its own titled section automatically; no launchpad rearchitecture.
- The launchpad, attribution badges, and collapse state are all registry-driven; the single-vendor experience is unchanged. Step 5 governs the `vendor-content` category at the org level (super-admin on/off + FYI notification), the final C4L arc step.
- No migration, no change to the refresh button / import safety / mapping / custody, and no change to how agents are created or edited.

## D-114 — Super-admin governance of vendor content + last-updated transparency (C4L/platform arc Step 5, arc complete)

Date: 2026-06-05
Status: Accepted

**Context:**

The arc's two-layer governance needed its second layer: the platform owner controls WHAT the curated content is (Steps 1-4); the super admin needed to control WHETHER their org uses/sees it. The Step 5 prompt suggested mirroring the `'mcp'` governed category (adding `'vendor-content'` to `connection_policy.allowed_categories`, gated by `isCategoryAllowed`). But that prompt ALSO required default-PERMITTED ("shows until explicitly denied; sensible pre-migration") — which the permit-list cannot satisfy: `allowed_categories` is a permit-list that defaults to DENY-when-absent, so default-permit-when-absent and explicit-deny-by-removal are mutually exclusive there.

**Decision:**

Govern vendor content with a dedicated per-`(organization, provider)` store — `content_provider_settings(enabled boolean default true, last_refreshed_at)` (migration 0059) — NOT `allowed_categories`. A provider with NO row (and a missing table, pre-migration) is treated as ENABLED, so vendor content shows by default and stays shown until a super admin explicitly disables a provider (which writes `enabled=false`); the launchpad gates each vendor section on this (`getAgentsForDepartmentLaunchpad` filters `externalGroups` and returns a `vendorContentEnabled` flag so a fully-off org renders no vendor surface, not even the empty-state). The control is a "Content" section in Policy & access (a list of providers, super-admin-editable / org_admin read-only, optimistic-save), per the locked C4L-placement decision. A passive per-provider "last updated" line — written by the platform-owner refresh (`recordVendorContentRefreshed`, service-role) and read by super admins — provides transparency with no adopt action (push model). This DEVIATES from the prompt's `allowed_categories` suggestion; reported and justified.

**Reasoning:**

A dedicated default-true flag is the only representation that satisfies all three stated requirements at once (default-permit, explicit-deny, sensible pre-migration / deploy-tolerant), whereas the deny-default permit-list cannot. It is also the multi-provider-ready store the locked C4L-placement decision specified (keyed by org + provider) — the right shape now that the launchpad is vendor-agnostic (Step 4), so a second provider is a new row, not a redesign. The governance LOCATION and UX still mirror `'mcp'` (a super-admin Policy & access toggle that truly gates org-wide), honoring the prompt's intent. Passive last-updated fits the push model (the super admin has nothing to do) without an active badge/banner that would nag.

**Consequences:**

- Firms can disable vendor content org-wide; super admins have honest update visibility without an adoption burden. The two-layer governance (platform owner owns the content; super admin owns whether the org uses it) is complete.
- **The C4L + platform-owner arc is COMPLETE** (platform-owner tier; safe updatable import; one-button refresh; vendor-agnostic structure; super-admin governance + transparency).
- Migration `0059_content_provider_settings.sql` (per-org per-provider settings, RLS read-org / super-admin-write, default-permit, no seed). Deploy-tolerant: pre-migration the settings read fails to "all enabled" so the launchpad is unchanged. No change to the refresh import logic, the mapping, custody, or the vendor-agnostic structure.

## D-115 — Headless runAgent primitive (Workflows arc Step 1)

Date: 2026-06-05
Status: Accepted

**Context:**

Agent execution was entangled in the streaming chat loop with no programmatic entry point: the multi-round agentic loop, credential/system-prompt/MCP-tool resolution, SSE encoding, message persistence, and the Phase 2 write-confirmation pause/resume are all coupled inside `lib/chat/assistant-stream.ts` + the chat-route preamble. Multi-step workflows (the next arc) need to run an agent and get its output without the chat UI — a workflow agent-step calls it.

**Decision:**

Extract a server-side, non-streaming `runAgent(agent, input) → { output, toolCalls, usage }` (`lib/agents/run-agent.ts`) that reuses the existing credential, system-prompt, and governed MCP-tool resolution and runs the same multi-round agentic read-loop under the same governance, never performs an unattended write, and writes `usage_events`. Rather than fully unify the agentic loop with chat (which would risk regressing chat's pause/resume), share at the INGREDIENT level: a new `resolveGatedOrgMcpTools()` (the org governance + read/write classification, now used by BOTH the chat route and runAgent) and shared loop guards (`mcp-loop-guards.ts`); the chat route keeps its streaming, persistence, and Phase 2 write-confirmation orchestration byte-identical (its only change is calling the shared resolver and importing the shared guards). The headless loop is a small, deliberately separate orchestration over the same shared primitives (`streamAnthropicChat`+`finalMessage()`, `executeMcpTool`, the same guards). It drives the SDK stream to completion via `finalMessage()`/`finalUsage()` without consuming the SSE events generator. Write safety: headless runs OFFER the model only READ-classified MCP tools and the loop refuses any write tool_use it receives (belt and suspenders), so no new write capability and no unattended write are introduced. `usage_events` is written via the service-role client (no request session required), attributed to org/user/agent with conversation/message null.

**Reasoning:**

The enabling foundation for the Workflows engine — an agent-step calls `runAgent`. Sharing the governed resolution + guards avoids forking the model/tool/governance logic, while keeping the chat loop's outer orchestration untouched is the conservative split that guarantees chat behavior-neutrality (the task's paramount constraint). Preserving the no-unattended-write posture keeps the v1 safety guarantee; building on the existing governed primitives keeps it provider-agnostic and consistent with chat. Designing `runAgent` as an I/O wrapper over a pure, dependency-injected `runAgentLoop` makes the loop unit-testable with fakes (no network/DB).

**Consequences:**

- Workflows (and other server-side callers) can run agents headlessly; the result carries the final text, a token/PII-safe tool trace, and summed usage + cost.
- Write execution in a headless/workflow context is deferred to the human-checkpoint design (Step 3); until then a workflow agent-step is read-only by construction.
- Chat is unchanged (streaming, persistence, Phase 2 pause/approve/resume, governance all byte-identical). No migration: `usage_events.conversation_id` / `message_id` are already nullable.

## D-116 — Workflow data model + deterministic execution engine (Workflows arc Step 2)

Date: 2026-06-05
Status: Accepted

**Context:**

The Workflows arc needs the engine itself: a way to define a multi-step workflow and execute it deterministically with a legal-grade audit trail, built so a future agentic/hybrid layer is additive rather than a rewrite. Step 1 shipped the headless `runAgent` an agent-step calls; Step 2 is the data model + engine.

**Decision:**

Model a workflow as a DECLARATIVE STEP-GRAPH definition (jsonb: `{ steps: Step[] }`), cleanly separated from execution. Each step has a stable `id` and a `type` tag (the typed union: `agent` / `tool_action` / `human_checkpoint`, with router/conditional representable later); v1 executes steps in array order (linear), and branching is an additive `edges`/`next` overlay keyed by step id that needs no migration (the stable ids are the seam — no unused `next` field is added now). Step-to-step data flow is an explicit input mapping with a simple default: a step's input resolves from `{ source: previous | run_input | step | literal }`, defaulting to `previous` (the prior step's output; the first step's `previous` is the run input), so linear workflows need almost no mapping config. A pure, dependency-injected engine (`lib/workflows/engine.ts` `runWorkflow`) walks the steps, resolves each input, dispatches by type — agent → the headless `runAgent` (reads only, Step 1 guarantee); tool_action → `executeMcpTool` restricted to READ-classified governed tools (no unattended writes); human_checkpoint → record `awaiting_approval` and STOP (no auto-approve; durable resume is Step 3) — fail-stops on a step failure, never throws, and returns one immutable step record per executed step. An I/O wrapper (`lib/workflows/run.ts`, invoked by the `startWorkflowRun` server action) snapshots the definition into the run at run time (so later edits never mutate historical runs), wires real resolvers (agent loading + governed MCP targets), and persists `workflow_runs` + one immutable `workflow_step_runs` row per step. A data-boundary validator (`validateWorkflowDefinition`) gates every definition — known step types, unique stable ids, prior-only mapping references, resolvable+governed capabilities, no write tool_actions — and is the SAME gate a future agent-emitted definition passes. Capability references (agentId; serverId+toolName) resolve from the existing registries (the agents table; `resolveOrgMcpTools` governance) so a newly-connected tool is a turnkey step with no engine change. Migration 0060 adds `workflow_definitions`, `workflow_runs` (with `definition_snapshot`), `workflow_step_runs`, and a nullable `usage_events.workflow_run_id` so agent-step cost is traceable to its run.

**Reasoning:**

Deterministic + auditable is the legal requirement; the declarative-data model, definition/execution separation, and data-boundary validation are what keep the agentic/hybrid layer additive (an orchestrator agent emits the same validated graph a human composer does — deterministic safety and agentic openness are the same mechanism). Resolving capabilities from existing registries makes new tools turnkey. Linear v1 with branching representable avoids a later rewrite. Restricting agent-steps and tool_action steps to reads preserves the no-unattended-write posture established in Step 1. A pure engine over injected resolvers makes the orchestration unit-testable with fakes (no model/MCP/DB), mirroring how `runAgent`'s loop was built.

**Consequences:**

- Workflows can be defined and run server-side now; the builder UI (Step 4), human-checkpoint execution / resume (Step 3), branching/routing, triggers, and C4L templates (Step 5) all build on this without re-architecting.
- Write actions in a workflow will route through the future human-checkpoint mechanism (Step 3); v1 has no unattended writes anywhere.
- Migration `0060_workflows.sql` (the three tables + RLS, org-scoped: the triggering user owns a run, org admins read; org-admin authoring of definitions; plus the `usage_events.workflow_run_id` column). The operator applies it. Deploy-tolerant: nothing outside the Workflows surface touches these tables, so the rest of the app is unchanged whether or not it is applied.

## D-117 — Workflow human checkpoints, approved writes, and the autonomy foundation (Workflows arc Step 3)

Date: 2026-06-05
Status: Accepted

**Context:**

Step 2 shipped the engine with human_checkpoint steps that pause-and-stop and a blanket rejection of write tool_actions (no safe-write path). Step 3 completes the safety/write model: a workflow must be able to take real write actions, but only under human approval, and the design must realize the co-pilot ↔ auto-pilot spectrum architecturally while shipping only the safe end. The proven primitive is the Phase 2 chat write-confirmation: persist resumable state (token_ref, never a token), emit a confirmation, end the request, and resume on an owner decision via an atomic at-most-once claim.

**Decision:**

Generalize that pattern to workflow runs. Introduce a RUN-level `autonomy_level` (`supervised` default | `autonomous`) — autonomy is a property of the run, not the definition, so the same definition can run supervised or (later) more autonomously. The engine branches the pause decision on it: a `human_checkpoint` under supervised pauses for approval and stops; under autonomous it auto-proceeds (recorded `auto_proceeded`). A WRITE `tool_action` pauses for approval in EVERY autonomy mode (the validator now ALLOWS write tool_actions because they are approval-gated; the resolver returns `needs_approval` and never executes a write; the pure engine has NO write-execution path at all). On approval, the write executes once via `executeMcpTool` (live token re-resolved from the persisted token_ref), recorded `human_approved`; on deny the run is `cancelled`. The durable state is a `workflow_pending_approvals` row (one open decision per paused run; a write stores route+toolInput+toolUseId with token_ref only), and resume reconstructs the value context from the run's completed step outputs, re-enters the engine at the paused step, and continues. An ATOMIC `pending→resolving` claim guarantees an approved write executes at most once. `workflow_step_runs.approval_mode` records per-step provenance (`human_approved` | `auto_proceeded` | null) for the legal audit. The decision entry point is the `decideWorkflowApproval` server action (no UI yet). v1 ships supervised live; autonomous is represented but its writes still require approval — unattended auto-write is a deliberately gated future capability. The resume logic (claim, approve/deny, write-execute, continue) is a pure, dependency-injected function unit-tested with fakes, so the at-most-once and approve/deny paths are tested without a DB.

**Reasoning:**

Completes the safe-write story on a proven pattern, with the same custody discipline (token_ref only, live re-resolution). Modeling autonomy as a run-level setting realizes the co-pilot ↔ auto-pilot spectrum architecturally while shipping only the safe (supervised) end — appropriate to legal liability, where "agents may act without human approval" must be a deliberate, explicitly-permissioned opt-in, not a default. Keeping write execution OUT of the pure engine (only reachable through the approval-resume path's injected executor) makes "no unattended write" a structural guarantee, not a policy check. Per-step approval provenance serves the legal audit requirement ("was this human-reviewed or run autonomously?"). The atomic claim mirrors the Phase 2 at-most-once guarantee.

**Consequences:**

- Workflows can take real actions under human approval; on approve the write actually executes and the run continues, on deny it stops.
- Fuller autonomy (auto-pilot writes) remains a deliberately gated future capability; v1 never performs an unattended write in any mode.
- The builder + approval UI (Step 4) exposes this over the `startWorkflowRun` / `decideWorkflowApproval` actions; branching, triggers, and C4L templates build on it.
- Migration `0061_workflow_approvals_and_autonomy.sql` (`workflow_runs.autonomy_level`; `workflow_step_runs.approval_mode`; the `workflow_pending_approvals` table + RLS, owner-decides / org-admin-read, token_ref only). The operator applies it. Requires 0060; deploy-tolerant (nothing outside Workflows touches it).

## D-118 — No-code workflow builder over the canonical graph (Workflows arc Step 4a)

Date: 2026-06-05
Status: Accepted

**Context:**

The engine and data model shipped (Steps 1-3), all server-side; the "My Workflows" surface was still a coming-soon stub. Step 4 brings the UI, split into 4a (builder + My Workflows: compose and save) and 4b (run/audit/approve). The operator chose the most foundationally sound builder: an editor over the canonical declarative graph, not a separate "UI format" requiring translation.

**Decision:**

Build a form/list builder (not a visual canvas) that edits the CANONICAL `workflow_definitions.definition` jsonb directly — an ordered list of steps you add (run an agent / take an action / human approval), configure, and reorder, with each step carrying a stable id and an explicit input mapping (default: the previous step's output). Saving goes through a server action that runs the SAME `validateWorkflowDefinition` the engine uses BEFORE persisting, surfacing validation errors inline — so what you build is exactly what runs. Available steps are resolved from the LIVE, governed registries via a new `getWorkflowCapabilities()` (org native agents from the agents table, RLS-scoped; governed MCP tools from `resolveOrgMcpTools`, each with its discovered input schema and read/write classification reusing the chat tool-naming) — never a hardcoded menu, so a newly added agent or connected tool appears automatically (the turnkey property), and a write tool surfaces marked "requires approval" (Step 3). The capability transform (`mcpTargetsToToolOptions`) is pure and unit-tested. Validation policy: a definition with steps is fully validated (structure + resolvable governed capabilities + mapping integrity) for BOTH draft and active, so a stored definition is always valid-or-empty; the one relaxation is that an empty draft may be saved (activating requires ≥1 step). Step types are chosen at add-time (Add an agent / action / approval) rather than a per-step type-switch, avoiding a destructive "change type wipes config" interaction. Autonomy stays a RUN-level setting (chosen at run time, 4b), NOT a builder field, keeping the architectural separation clean. Authoring is org-admin gated (page-level `notFound()` + the authoring layer re-verifies + RLS re-enforces); org members can read the list. No migration — this is an editor over the existing 0060 schema.

**Reasoning:**

A form/list editor over the canonical graph is the foundationally sound v1: it produces exactly what the engine runs (no translation layer to drift), matches the linear execution model honestly, and keeps a future visual canvas additive (same data, when branching execution lands) — exactly as the data model keeps the branching/agentic doors open. Live-registry capability resolution delivers the turnkey property and means the builder can never offer a capability the engine can't run. Validating with the engine's own validator before persisting makes the builder and the runtime share one definition of "valid." Deferring run/audit/approval UI to 4b keeps each surface shippable.

**Consequences:**

- Admins can compose, save, and edit workflows now; running, watching, auditing, and approving land in 4b; the Template Library (Step 5) stays a coming-soon card.
- The builder reads `getWorkflowCapabilities()`, so connecting a new tool or adding an agent immediately widens what a workflow can do, with no builder change.
- A canvas builder, if ever wanted, is a new editor over the same canonical graph — not a rewrite.

## D-119 — Workflow run, audit, and approval UI (Workflows arc Step 4b)

Date: 2026-06-06
Status: Accepted

**Context:**

Steps 1-3 shipped the engine (headless runAgent; the data model and deterministic execution; durable human checkpoints, approved writes, and run-level autonomy), and Step 4a shipped composing and saving workflows. The two run-side server actions (`startWorkflowRun`, `decideWorkflowApproval`) were live but had no UI: nobody could run a workflow, watch it, read its audit trail, or decide a pending approval.

**Decision:**

Build the run experience entirely OVER the existing engine actions, with no engine change. Three surfaces: (1) a run-start page (`/workspace/workflows/my-workflows/[id]/run`, plus a "Run" affordance on My Workflows cards for active workflows) where any member who can read the definition provides the run input and chooses the RUN-level autonomy (supervised default, with plain-language explanations; even autonomous runs pause before any write, per Step 3), with this workflow's recent runs listed below; (2) a run view (`/workspace/workflows/runs/[runId]`) rendering the run header (status, autonomy, who started it, timing) and the step-by-step timeline — the run's frozen `definition_snapshot` merged with the immutable `workflow_step_runs` rows, so unreached steps are visible as pending/not-run — showing each step's friendly type (reusing the chat tool-naming), status, the input it consumed and output it produced (prose for agent text, mono JSON for tool data, long content behind a disclosure), timing, and approval provenance ("Approved by you" / "Proceeded automatically" / "Denied by …"); (3) an approval card (mirroring the chat write-confirmation register) that appears when the run is awaiting approval: a checkpoint shows its prompt, a write shows the friendly tool label plus argument KEY NAMES only (never values — the chat PII bar), and Approve resumes the run (the write executes through the governed executor with a live re-resolved token) while Deny cancels it. Only the run's owner can decide (RLS-enforced; admins watch read-only), and a decision that lost the atomic at-most-once claim settles the card calmly as already-decided. Refresh model: the run executes server-side inside the actions and the view renders persisted state; a non-terminal run mounts a quiet visibility-gated poll (`router.refresh()` every 7s) and decisions refresh immediately — no streaming in v1. The timeline derivation, status/provenance/duration/value formatting, and PII-safe arg-key summary live in a pure, unit-tested view-model module (`lib/workflows/run-view.ts`). No migration.

**Reasoning:**

This makes the deterministic, auditable engine fully usable and trustworthy for legal: the run view IS the audit surface a lawyer relies on, so it renders the immutable per-step records completely and legibly, with human-versus-automatic provenance explicit. Reusing the proven chat confirmation register (and its keys-only PII bar) keeps the decision moment consistent across the product. Keeping autonomy a run-time choice preserves the Step 3/4a architectural separation (the same definition can run supervised or autonomous). Persisted-state-plus-poll is the honest fit for a server-side, pause-based execution model; streaming would add machinery without adding truth.

**Consequences:**

- Workflows are end-to-end usable: compose (4a) → run with chosen autonomy → watch → approve/deny → audit. Templates (Step 5), triggers, branching execution, and gated auto-writes remain future work.
- A future run-history/analytics surface can grow from the per-workflow recent-runs list without rework; the run view already renders any run RLS grants access to.
- The view-model module gives later surfaces (an org-wide runs list, insights) one tested vocabulary for statuses, provenance, and value rendering.

## D-120 — Workflow definition delete is a hard delete; run history survives by schema design (Workflow arc polish)

Date: 2026-06-06
Status: Accepted

**Context:**

The builder polish pass added the missing delete-workflow action. The open question was hard delete versus a soft-delete/archive state, since workflow runs are a legal audit surface that must never lose history when a definition goes away.

**Decision:**

Hard delete, because the 0060 schema already encodes the contract "a run outlives its definition": `workflow_runs.workflow_definition_id` is declared `on delete set null`, and every run carries its own immutable `definition_snapshot` (plus its step rows and approval records), so deleting a definition leaves all run history intact and viewable — the run view already renders a definition-less run (generic "Workflow run" title, the back-to-workflow link hidden). The action is org-admin gated (page gate + authoring-layer re-check + the `workflow_definitions_admin_write` RLS policy), behind an explicit confirmation dialog that states runs are preserved.

**Reasoning:**

A soft-delete state would add a third lifecycle status overlapping the existing `archived` without adding audit value: everything the audit trail needs (the exact steps that ran, inputs/outputs, timing, approval provenance) lives on the run, not the definition. Honoring the schema's designed seam keeps one deletion semantic instead of two.

**Consequences:**

- The only thing lost on delete is the definition row itself: historical runs of a deleted workflow display under the generic "Workflow run" title because the snapshot stores steps, not the name. If that name matters for audit later, stamping the workflow name into the run at start time is an additive change.
- `archived` remains the reversible "parked" state; delete is the irreversible one, and the confirmation copy distinguishes them honestly.
