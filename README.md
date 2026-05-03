# legalOS

An operating system for legal departments. legalOS gives in-house lawyers and legal-ops teams a single, AI-native entry point for the workflows, agents, and tools they use day-to-day — built around how legal work actually happens, with role-based access, conversation history, attached references, web search, and per-message Word export already in place.

This is open-source software you can fork and run for your own legal department, or adapt as the starting point for a multi-tenant SaaS.

## Current phase

**Phase 2 — Agent product surface.** Native agents with chat, attachments, prompt caching, web search, and per-message Word export are live; agent CRUD, soft-delete + 30-day undo, and an 8-department launchpad ship behind RBAC. See [`PROJECT_OUTLINE.md`](./PROJECT_OUTLINE.md) for the full phase plan.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui |
| Backend | Next.js API routes + server actions |
| Database | Supabase (PostgreSQL) with Row-Level Security |
| Auth | Supabase Auth (magic link) |
| AI / LLM | Anthropic API (Claude); model abstraction in Phase 6 |
| Hosting | Vercel |

## Documentation

- [`SETUP.md`](./SETUP.md) — fork this repo and run it locally or deploy to Vercel.
- [`PROJECT_OUTLINE.md`](./PROJECT_OUTLINE.md) — phase plan, architecture, roadmap.
- [`CLAUDE.md`](./CLAUDE.md) — coding conventions and AI-assistant rules.
- [`DECISION_LOG.md`](./DECISION_LOG.md) — architectural decisions and their reasoning.
- [`CHANGELOG.md`](./CHANGELOG.md) — version history.
- [`skills-checklist.md`](./skills-checklist.md) — which skill files live in `.claude/skills/` per phase.

## Future / Backlog

Features and surfaces deliberately deferred. Capturing intent here so it isn't lost.

- **In-app support chat** — replaces the legacy floating support button removed in 10b. User-initiated chat surface for product support; surfaces from inside the workspace chrome rather than emailing legal-ops out-of-band.

## License

TBD. A license file will be added before the first public release.
