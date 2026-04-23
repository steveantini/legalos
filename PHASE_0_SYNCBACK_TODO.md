# Phase 0 Sync-Back TODO

Items discovered during Phase 0 that need to be generalized back into the
portable `claude-templates` skill library. Tracked here so the list
survives between sessions. A dedicated sync-back session (not in-line
with feature work) will execute these.

Per `CLAUDE.md` "Skill Template Sync Convention": no phase is considered
complete until this list is drained into actual updates in
`claude-templates`.

## Skills to update

### `skills/frontend/tailwind.md` — v3 → v4

Trigger: `DECISION_LOG.md` D-014. The upstream skill covers both v3 and v4
in parallel, but leads with v3 patterns. For new projects, v4 is the
default; skill should lead with v4 and keep v3 as a clearly-labeled
"migrating from v3" section.

Specific changes:
- Swap the "Custom Theme Extension" primary example from `tailwind.config.js`
  `theme.extend` to `@theme` in CSS.
- Make the design-tokens pattern OKLCH-first (to match shadcn 4's default)
  with a short note that HSL is also valid.
- Clarify that Tailwind v4 auto-detects content sources — drop the "Content
  Configuration" section to a footnote.
- Add explicit mention of shadcn's `@import "shadcn/tailwind.css"` pattern
  alongside `@import "tailwindcss"`.

### `skills/design/ui-patterns.md` — primitive-agnostic + v4 tokens

Trigger: `DECISION_LOG.md` D-015 and review notes from Phase 0 Session 2
Step 7.

Specific changes:
- "Dependencies" field reads "Radix UI / shadcn/ui (recommended)". Update
  to "Base UI or Radix UI (via shadcn/ui), or any accessible primitive
  library", or make it primitive-agnostic.
- "Design Tokens" example uses HSL (`--color-background: 0 0% 100%;`) and
  `--color-*` prefix. Update to OKLCH (`--background: oklch(1 0 0);`) with
  bare `--*` names, matching what shadcn 4 scaffolds today. Keep the
  `@theme inline` bridging pattern so the `--color-*` form is still
  consumable by Tailwind utilities without being the storage format.
- Dark-mode section similarly uses HSL — convert to OKLCH.

### `skills/frontend/nextjs.md` — layout flexibility note + middleware→proxy rename

Trigger: `DECISION_LOG.md` D-016 (layout) and D-017 (middleware→proxy).
Review notes from Phase 0 Session 2 Step 7 (layout) and Session 3b build
warnings (proxy).

Specific changes:
- **Layout (D-016):** The "Project Structure Recommendation" section
  recommends a `src/` layout. Add a one-paragraph preamble noting that
  either `src/` or root-level is valid; the project should pick one and
  document it in its own CLAUDE.md. Show both variants side-by-side
  rather than prescribing one.
- **Middleware → Proxy rename (D-017):** Next.js 16 renamed the
  `middleware.ts` file convention to `proxy.ts` (API identical; only
  filename and exported function name change). Update the Reserved
  Files table (line ~36), the dedicated "Middleware" section (line
  ~187), the example code (line ~195), and the limitations note (line
  ~220). Frame as "Proxy (formerly Middleware in Next.js ≤15)" so the
  skill still aids forkers on older majors.

## Non-skill items (for completeness)

None at the end of Phase 0. All other Phase 0 learnings either stayed
project-local (e.g., D-013's "Next.js 16 is bleeding-edge" warning, which
lives in the project-specific adaptation note, not the template) or were
rolled directly into commits.

## When

Execute before starting Phase 2 at the latest. A dedicated sync-back
session on `claude-templates` — not interleaved with launchpad feature
work.
