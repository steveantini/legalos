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
