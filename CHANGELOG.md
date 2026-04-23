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

### Changed

- Tech-stack references in `CLAUDE.md`, `README.md`, and `PROJECT_OUTLINE.md` updated from Next.js 15 → Next.js 16 and Tailwind CSS → Tailwind CSS v4 to match the scaffold.
- `skills-checklist.md` Tailwind adaptation note rewritten to describe the v4 pattern (`@import "tailwindcss"`, `@theme` directive, CSS-first tokens) instead of v3's `theme.extend`.
- `.gitignore` merged: scaffold's Next.js / Yarn-PnP entries combined with project-specific entries (Supabase local dev, Claude local settings, `!.env.example` allowlist, editor/OS files).
- Decision: magic link is the sole auth method (D-018, amends D-006).

### Removed

- `AGENTS.md` scaffolder file. Its Next.js 16 warning content was folded into the project-local note at the top of `.claude/skills/nextjs.md` per D-013.
- Scaffold-auto-installed `components/ui/button.tsx` — shadcn components will be added deliberately via `shadcn add <name>` when actually needed, per D-015's consequences.

## [0.1.0] - 2026-04-22

### Added

- Initial planning documents: `CLAUDE.md`, `PROJECT_OUTLINE.md`, `DECISION_LOG.md`, `SETUP.md`, `skills-checklist.md`.
- Initial Supabase schema at `supabase/migrations/0001_initial_schema.sql`.
