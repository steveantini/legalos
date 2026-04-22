# Legal Department Launchpad Template

An AI-native launchpad template for in-house legal departments — a single, welcoming entry point for every AI agent and tool a legal team uses day-to-day, whether external (Gemini Gems, watsonX Orchestrate, custom links) or natively hosted.

## Current phase

**Phase 0 — Foundation.** Repo scaffolding and planning docs. See [`PROJECT_OUTLINE.md`](./PROJECT_OUTLINE.md) for the full phase plan.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Next.js API routes + server actions |
| Database | Supabase (PostgreSQL) with Row-Level Security |
| Auth | Supabase Auth (email/password + magic link) |
| AI / LLM | Anthropic API (Claude); model abstraction in Phase 6 |
| Hosting | Vercel |

## Documentation

- [`SETUP.md`](./SETUP.md) — fork this repo and run it locally or deploy to Vercel.
- [`PROJECT_OUTLINE.md`](./PROJECT_OUTLINE.md) — phase plan, architecture, roadmap.
- [`CLAUDE.md`](./CLAUDE.md) — coding conventions and AI-assistant rules.
- [`DECISION_LOG.md`](./DECISION_LOG.md) — architectural decisions and their reasoning.
- [`CHANGELOG.md`](./CHANGELOG.md) — version history.
- [`skills-checklist.md`](./skills-checklist.md) — which skill files live in `.claude/skills/` per phase.

## License

TBD. A license file will be added before the first public release.
