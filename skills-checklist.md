# Skills Checklist: Phase 0 Copy Plan

This document is the authoritative Phase 0 checklist for copying skill files from your `claude-templates` library into this project's `.claude/skills/` directory.

Copy these **before** writing any feature code. Claude Code will read them at session start.

---

## Phase 0 — Copy these 11 skills

| # | Source path | Destination | Adaptation needed? |
|---|---|---|---|
| 1 | `skills/frontend/nextjs.md` | `.claude/skills/nextjs.md` | No |
| 2 | `skills/frontend/react-patterns.md` | `.claude/skills/react-patterns.md` | No |
| 3 | `skills/frontend/tailwind.md` | `.claude/skills/tailwind.md` | Minor — see notes |
| 4 | `skills/design/ui-patterns.md` | `.claude/skills/ui-patterns.md` | No |
| 5 | `skills/design/responsive-design.md` | `.claude/skills/responsive-design.md` | No |
| 6 | `skills/design/ux-writing.md` | `.claude/skills/ux-writing.md` | Minor — see notes |
| 7 | `skills/frontend/web-accessibility.md` | `.claude/skills/web-accessibility.md` | No |
| 8 | `skills/devops/environment-management.md` | `.claude/skills/environment-management.md` | No |
| 9 | `skills/devops/vercel-deployment.md` | `.claude/skills/vercel-deployment.md` | No |
| 10 | `skills/security/frontend-security.md` | `.claude/skills/frontend-security.md` | No |
| 11 | `skills/security/infra-security.md` | `.claude/skills/infra-security.md` | No |

### Copy command

From the repo root, assuming your `claude-templates` lives at `~/dev/claude-templates`:

```bash
mkdir -p .claude/skills

cp ~/dev/claude-templates/skills/frontend/nextjs.md            .claude/skills/
cp ~/dev/claude-templates/skills/frontend/react-patterns.md    .claude/skills/
cp ~/dev/claude-templates/skills/frontend/tailwind.md          .claude/skills/
cp ~/dev/claude-templates/skills/design/ui-patterns.md         .claude/skills/
cp ~/dev/claude-templates/skills/design/responsive-design.md   .claude/skills/
cp ~/dev/claude-templates/skills/design/ux-writing.md          .claude/skills/
cp ~/dev/claude-templates/skills/frontend/web-accessibility.md .claude/skills/
cp ~/dev/claude-templates/skills/devops/environment-management.md .claude/skills/
cp ~/dev/claude-templates/skills/devops/vercel-deployment.md   .claude/skills/
cp ~/dev/claude-templates/skills/security/frontend-security.md .claude/skills/
cp ~/dev/claude-templates/skills/security/infra-security.md    .claude/skills/
```

Commit them in a single commit: `chore: copy phase 0 skills from claude-templates`.

---

## Adaptation notes

Most skills copy cleanly. Two need small tweaks at the top of the file to pin them to this project's specific choices.

### `tailwind.md` — add a project-specific v4 + theme-preset note

Your upstream `tailwind.md` is written against Tailwind v3. This project uses Tailwind v4 (see `DECISION_LOG.md` D-014). v4 is CSS-first: there is no JS `tailwind.config.ts` by default. Design tokens live in CSS via `@import "tailwindcss"` and the `@theme` directive. The project's theme-preset approach (Carbon / Modern / Minimal / Custom) ported from the prior `agent-launchpad-template` maps directly onto v4's CSS-variable-first model.

Add a note at the top of `.claude/skills/tailwind.md`:

```markdown
> **Project-specific note (Tailwind v4):** This project uses Tailwind CSS v4.
> Design tokens live in CSS using `@import "tailwindcss"` and the `@theme`
> directive, not in a JS `tailwind.config.ts`. Theme presets
> (Carbon / Modern / Minimal / Custom) are expressed as CSS variables and
> switched by a `data-theme` attribute (or class) on `<html>`. When adding
> new color or spacing tokens, define them as CSS variables under `@theme`
> in `app/globals.css` (or a dedicated `config/theme.css`) and reference
> the generated utilities — never hardcode hex values in component
> `className` strings.
>
> The upstream `claude-templates/skills/frontend/tailwind.md` is written
> against v3. Generalizing this v4 guidance back to the portable template
> is an explicit end-of-Phase-0 skill-sync item (see D-014).
```

### `ux-writing.md` — add a legal-domain tone note

Your template covers UX microcopy generally. For this project, add a note at the top:

```markdown
> **Project-specific note:** Users are in-house lawyers. Copy is clear and direct
> without being glib. Avoid cutesy empty states ("Oops!", "Whoops, nothing here!")
> — legal audiences read them as unserious. Error messages state what happened,
> why, and what to do next. Button labels use plain verbs ("Save changes",
> "Generate draft", not "Let's go!").
```

---

## Skills NOT needed in Phase 0

These are valuable but premature. They'll be copied in later phases per the plan in `PROJECT_OUTLINE.md`.

| Skill | Phase when it joins | Why not Phase 0 |
|---|---|---|
| `supabase.md` | Phase 1 | No DB work until auth + schema begin |
| `database-patterns.md` | Phase 1 | Same |
| `database-security.md` | Phase 1 | Same |
| `backend-security.md` | Phase 1 | No backend work until auth |
| `api-security.md` | Phase 1 | No API routes yet |
| `python-api.md` | Never (for this project) | Using Next.js API routes instead |
| `anthropic-api.md` | Phase 2 | Native agents arrive in Phase 2 |
| `prompt-engineering.md` | Phase 2 | Same |
| `mcp-development.md` | Phase 7+ | Only if we add MCP tool use |
| `model-abstraction.md` | Phase 6 | Multi-provider support |
| `analytics.md` | Phase 2 (localStorage → Supabase transition) | Premature until real events exist |
| `cost-tracking.md` | Phase 7 | Needs real token usage first |
| `eval-framework.md` | Phase 7 | Needs a non-trivial agent catalog first |
| `observability.md` | Phase 7 | Scale doesn't justify it yet |
| `ci-cd.md` | Phase 7 | Vercel's built-in PR checks are sufficient until then |

---

## Verifying the copy

After copying, verify:

```bash
ls -1 .claude/skills/
```

You should see exactly 11 files. If any are missing or mis-named, re-copy. Filenames matter because the skill routing table in `CLAUDE.md` references them by exact name.

Open `.claude/skills/nextjs.md` and check the "Last updated" date. If it's more than a few months old, skim the file for anything that might have drifted (Next.js moves fast) and check against the current [Next.js docs](https://nextjs.org/docs) before committing.

---

## Sync-back convention reminder

Per `CLAUDE.md`, at the end of every phase, any improvements made to these project-local skill files must be synced back to `claude-templates`.

For Phase 0, the expected sync-back is minimal — the adaptation notes above. If during Phase 0 you discover a new pattern worth generalizing, update the template too.
