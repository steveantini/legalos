# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Next.js 16 + React 19 scaffold via `create-next-app@16.2.4` (App Router, TypeScript, Tailwind CSS v4, ESLint 9, Turbopack; no `src/`; import alias `@/*`).
- shadcn/ui initialized with Base UI primitives (`--defaults` preset: `base-nova`, `baseColor: neutral`, Lucide icons). `cn()` helper in `lib/utils.ts`; pure-neutral OKLCH CSS variables in `app/globals.css` leave room for theme presets.
- 11 Phase 0 skill files copied from `claude-templates` into `.claude/skills/`: `nextjs.md`, `react-patterns.md`, `tailwind.md`, `ui-patterns.md`, `responsive-design.md`, `ux-writing.md`, `web-accessibility.md`, `environment-management.md`, `vercel-deployment.md`, `frontend-security.md`, `infra-security.md`.
- Project-specific adaptation notes at the top of three skills: `nextjs.md` (Next.js 16 warning, absorbing the scaffold's now-deleted `AGENTS.md`), `tailwind.md` (v4 `@theme` directive + CSS-variable pattern), `ux-writing.md` (legal-audience tone).
- `config/` directory with three stub files: `site.ts` (branding + active theme preset), `departments.ts` (seed list + shape for the five starting departments), `theme.ts` (preset registry + metadata). TypeScript types and TODOs only; not yet wired into any component.
- Bootstrap docs: `README.md`, `CHANGELOG.md` (this file), `.env.example` (with server-only vs client-exposed annotations for Supabase and Anthropic keys).
- DECISION_LOG entries: **D-013** (Next.js 16 version choice), **D-014** (Tailwind v4 styling choice + skill-sync flag), **D-015** (shadcn/ui Base UI primitives over Radix), **D-016** (narrow directory structure: `lib/actions/`, `lib/hooks/`, top-level `styles/`), **D-017** (Next.js 16 proxy file convention, formerly middleware).
- Local magic-link authentication via `@supabase/ssr` (Session 3a): `/login` form + server action, `/auth/callback` code exchange, authenticated landing at `/`, and `lib/supabase/{server,browser}.ts` clients.
- Route gating via `proxy.ts` + first-login user provisioning (`ensure_user_provisioned()` SECURITY DEFINER RPC), server-side access helpers in `lib/auth/access.ts`, and a gated `/departments/[slug]` route (Commercial wired up; invalid-or-inaccessible slugs return 404 to avoid leaking existence) — Session 3b. Includes migration `0002_user_provisioning.sql` and idempotent seed `supabase/seed/0001_org_and_departments.sql`.
- Commercial launchpad UI (Session 4): `/departments/commercial` now renders category-grouped external agent cards (3 sell-side, 3 buy-side), a session-scoped welcome modal, a floating support button with a `mailto:` contact, and a legal-specific tips section (Privilege matters / Playbook first). Includes migration `0003_agents_category.sql` (adds `category` text column on `agents`), seed `supabase/seed/0002_commercial_agents.sql`, shadcn Dialog primitive, `getAgentsForDepartment` helper, and localStorage-backed agent-click analytics in `lib/analytics/events.ts` (D-010 Phase 1 fallback). Analytics fires on `onPointerDown` to avoid new-tab-open teardown races. Base UI primitives from D-015; no theme-preset port (deferred).
- Admin shell at `/admin` (Session 5 backfill — written in prior Session 5, never committed; surfaced and committed during the Session 5 fix audit, tagged `[BACKFILL]` in git log): authenticated-routes layout with main nav (`app/(app)/layout.tsx`, `components/nav/main-nav.tsx`), admin-only sub-layout calling `requireAdminUser()` with 404-on-non-admin to avoid leaking section existence (`app/(app)/admin/layout.tsx`), admin landing page with link cards (`app/(app)/admin/page.tsx`, `components/admin/admin-card.tsx`), admin auth helpers (`isCurrentUserAdmin`, `requireAdminUser` in `lib/auth/access.ts`), and sign-out server action at its CLAUDE.md-correct path (`lib/actions/auth.ts`). Includes a placeholder `AdoptionMetrics` view at `/admin/metrics` slated for Session 6 rebuild under Constraint C — see D-020.
- Productivity Gains Calculator rebuild at `/admin/calculator` (Session 5 fix): replaces the prior placeholder 4-input calculator with a faithful port of the multi-associate, multi-task workspace from `agent-launchpad-template/admin.html` (lines ~1115–1968). Per-associate name + salary inputs with computed fully-loaded hourly rate `(salary / 2080) × 1.3`; per-task description / tasks-per-year / time-w/o / time-w with derived hours-saved and savings; per-associate footer totals across all five numeric columns; grand totals (hours, savings, platform cost, ROI) with ROI styled green when ≥0 and red when <0; three shadcn Dialog info modals with verbatim source copy. CSV export wired to a real download (`productivity_savings_data.csv`) — improving on the original's `alert('Report export functionality coming soon!')` placeholder, documented as a Constraint C exception in D-019. localStorage persistence under `launchpad_calculator_data`. First reference port shipped under Constraint C (D-019); shadcn Card and Table primitives added to support it.

### Changed

- Tech-stack references in `CLAUDE.md`, `README.md`, and `PROJECT_OUTLINE.md` updated from Next.js 15 → Next.js 16 and Tailwind CSS → Tailwind CSS v4 to match the scaffold.
- `skills-checklist.md` Tailwind adaptation note rewritten to describe the v4 pattern (`@import "tailwindcss"`, `@theme` directive, CSS-first tokens) instead of v3's `theme.extend`.
- `.gitignore` merged: scaffold's Next.js / Yarn-PnP entries combined with project-specific entries (Supabase local dev, Claude local settings, `!.env.example` allowlist, editor/OS files).
- Decision: magic link is the sole auth method (D-018, amends D-006).
- Decision: Constraint C — functional parity with originals (D-019). Every reference port from `agent-launchpad-template` reads the source verbatim and replicates field-for-field, formula-for-formula, interaction-for-interaction. Visual style continues to follow shadcn defaults (Constraint B). D-020 scopes the immediate paraphrase debt: `components/admin/adoption-metrics.tsx` is a placeholder covering ~15% of the source's metrics surface and is deferred to a Session 6 rebuild under Constraint C. `lib/analytics/events.ts` (the data sink) and the localStorage-disclosure intro paragraph in `app/(app)/admin/metrics/page.tsx` survive the rebuild.

### Removed

- `AGENTS.md` scaffolder file. Its Next.js 16 warning content was folded into the project-local note at the top of `.claude/skills/nextjs.md` per D-013.
- Scaffold-auto-installed `components/ui/button.tsx` — shadcn components will be added deliberately via `shadcn add <name>` when actually needed, per D-015's consequences.

## [0.1.0] - 2026-04-22

### Added

- Initial planning documents: `CLAUDE.md`, `PROJECT_OUTLINE.md`, `DECISION_LOG.md`, `SETUP.md`, `skills-checklist.md`.
- Initial Supabase schema at `supabase/migrations/0001_initial_schema.sql`.
