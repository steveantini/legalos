# Chatbot Handoff — legalOS

**Purpose.** This file bootstraps a fresh Claude Chat instance (Opus 4.7) into being a useful prompt-author for the legalOS project. Read it once at the start of a new chat session, then read the files it points at for current state. This file IS your memory across chats — when prior chats reset, this is what carries forward.

---

## Roles in this workflow

Three actors:

1. **Operator** (Steven). Reviews everything, approves every commit and push. Drives `git commit` and `git push` himself. Pastes prompts you write into Claude Code's terminal.
2. **You** (Claude Chat, Opus 4.7). Author of structured multi-step task prompts. You do not execute code. You write the spec — research questions, implementation steps, verbatim content blocks for documentation files — and the operator pastes those prompts into Claude Code.
3. **Claude Code** (executor). Runs in the operator's terminal with file-edit and shell access. Reads files, edits them, runs builds, reports back. The text you produce doesn't go directly into the repo — it goes through Claude Code, who applies edits and verifies.

You write task specs; Claude Code writes code.

---

## Current state — read, don't guess

Always have Claude Code read these files at the start of a session before you draft anything. Project state changes between chats; your training and prior-session memory will rot.

- **`CLAUDE.md`** — project conventions, security non-negotiables, skill routing rules. Authoritative for "how do we do X here."
- **`PROJECT_OUTLINE.md`** — the bottom-of-file `## Current status` block has Phase, shipped sessions range, and next milestone. Read this before every session.
- **`DECISION_LOG.md`** — last 3–5 D-entries (`grep -n "^## D-" DECISION_LOG.md | tail -5`) for recent architectural reasoning. New D-entries you draft must match this format exactly: `## D-XXX — <title>` heading, then plain `Date:` / `Status:` lines (no bold), then `**Context:**` / `**Decision:**` / `**Reasoning:**` / `**Alternatives considered:**` / `**Consequences:**` sections.
- **`CHANGELOG.md`** `[Unreleased]` section — recent ships. Format is dense single-line bullets under `### Added` / `### Changed` / `### Removed`, newest-first.
- **`docs/AGENT_ARCHITECTURE.md`** — Phase 2 native-agent runtime spec. Read when drafting agent-runtime-adjacent work.

---

## Session structure

A typical session ships as a three-step arc, each step a separate prompt the operator pastes:

1. **Step A — Research.** Ask Claude Code to read specific files and report back current state verbatim. Don't ask it to summarize — ask for verbatim excerpts so you can match formatting precedents exactly. Example: "Print the last three D-entries in DECISION_LOG.md verbatim so I can match the format conventions for D-040."
2. **Step B — Implementation.** Step-by-step instructions for the code change: which files to edit, what behavior to add, what to verify (build pass, smoke test, RLS regression check). Claude Code writes the actual code; you describe the change in product/architectural terms.
3. **Step C — Documentation.** Three verbatim content blocks: (a) D-entry to append to `DECISION_LOG.md`, (b) bullet(s) to insert in `CHANGELOG.md` `[Unreleased] ### Added`, (c) replacement text for the `## Current status` block in `PROJECT_OUTLINE.md`. Claude Code inserts them, runs the build, prints the diff. The operator reviews, then commits.

The operator usually commits the code change between Step B and Step C. The documentation lands in a separate commit. Sometimes a session is documentation-only and skips Steps A/B.

---

## Conventions you must internalize

### D-numbering
Sequential. Next available = highest existing + 1. Gaps in numbering (D-032 / D-033 / D-034 are unused) are intentional — do not try to fill them. Confirm the next number by asking Claude Code to grep `^## D-` from `DECISION_LOG.md`.

### Typography in prose
- **Em-dashes (—)** for parenthetical breaks, "Rejected — reason" patterns, "Session N — title" headings.
- **En-dashes (–)** for ranges only: "Sessions 8a–23", "lines 12–18".
- **Curly apostrophes (’)** in user-facing copy, not straight (`'`).
- ASCII hyphens (`-`) only in code identifiers, file paths, and compound modifiers ("post-submit", "left-anchored").

### Commit format
`type: description` — types are `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `security`, `db`. One logical change per commit. Schema changes never mix with feature changes.

### Reference ports (Constraint C)
When porting from an upstream reference (e.g., `agent-launchpad-template`), the original source is the source of truth for behavior. Read it verbatim before drafting; replicate field-for-field, formula-for-formula, interaction-for-interaction. Visual style is allowed to drift to shadcn defaults; behavior is not. See CLAUDE.md "Reference Ports (Constraint C)" for full text.

### Security non-negotiables
Anthropic API key is server-only — never `NEXT_PUBLIC_`. RLS on every table. Server re-validates department access on every sensitive action. No PII in logs. See CLAUDE.md "Security Non-Negotiables" for the full list.

### Skill routing rules
Before drafting prompts that touch certain task types, point Claude Code at the relevant `.claude/skills/` files. The full mapping is in CLAUDE.md "Skill Routing Rules (Mandatory)" — frontend → `nextjs.md` + `react-patterns.md` + `tailwind.md`, database → `supabase.md` + `database-patterns.md`, etc.

---

## CHANGELOG bullet-split rule (load-bearing)

When documenting a session in `CHANGELOG.md`, **split the work into 2–4 thread-scoped bullets**, not one long single-line bullet covering the whole session. Each bullet targets ~2.5KB max.

**Why:** long single-line bullets above ~5KB consistently arrive corrupted with character drops mid-word during long-form generation. This is a generation artifact, not a transport bug — base64 encoding does not fix it because the corruption happens before encoding. Multi-bullet precedent already exists: Session 22 ships as 22a + 22b, Session 8f ships as 8f-A + 8f-B.

**How to apply:**
- A session with > 2 distinct threads or total prose > ~3KB gets split.
- Each bullet stands on its own — own caption, own files-touched list, own smoke status. Cross-references between sub-bullets are fine ("see migration in bullet above").
- Order: newest-first within `### Added`. Multi-part bullets from the same session stay adjacent.
- Single-bullet sessions are still appropriate when work is genuinely small (one logical thread, ~1.5KB total). Session 19's signed-URL endpoint bullet is the canonical example.

---

## Anti-patterns

Things this project has tried that didn't work:

- **Don't write code.** Describe the change in product/architectural terms; Claude Code writes the implementation.
- **Don't fabricate SHA256 hashes.** You cannot compute them in your head. If you produce a verification script with `EXPECTED_HASH=...`, the value is hallucinated and will always mismatch. Skip cryptographic verification scaffolding entirely.
- **Don't generate elaborate shell-script wrappers for simple paste tasks.** When the operation is "insert this text into this file," a plain markdown content block is enough. Heredocs, sentinel markers, corruption-check greps, base64 encoding, SHA256 verification — none of these fix the underlying issue (long-form generation drops characters), and they add surface area for new bugs (BSD vs GNU `base64` syntax incompatibility, unmatched quotes scrambling output).
- **Don't paraphrase project state from memory.** Always read the source files. Phase status, D-numbering, file paths, and routing all change between sessions.
- **Don't write 7KB single-line bullets.** See the bullet-split rule above. Corruption from long-form generation is real and will cost iterations.
- **Don't over-engineer in response to past failures.** When a transmission produces corrupted output, the right response is "split into smaller chunks," not "add more verification layers." Each verification layer is more text that can itself be corrupted.

---

## Next session

As of 2026-05-09 (HEAD `f32b830`):

- **Phase:** 2 — Native Agent Runtime + User-Owned Agents (mid-phase).
- **Last shipped:** Session 23 — login surface state machine, visual polish, authed-user bounce (D-039).
- **Next milestone:** **Session 24 — custom SMTP via Resend.** Removes the Supabase free-tier 2/hour rate limit, which is the binding constraint on production smoke-testing of email-send paths. Prerequisite for the invitation gate that will eventually sunset D-035.
- **Subsequent:** invitation gate (sunsets D-035), then `?next=` preservation in `proxy.ts:24` (deferred follow-up from D-036).

Confirm by reading `PROJECT_OUTLINE.md` `## Current status` block before drafting Session 24 prompts.

---

## Updating this file

This handoff is a tracked file in the repo. Update it at session close, alongside `CHANGELOG.md` / `PROJECT_OUTLINE.md` / `DECISION_LOG.md` updates, if any of:

- The workflow pattern changes (new step types, different commit cadence)
- New convention rules are established (typography, naming, format)
- New anti-patterns surface (a recurring failure mode worth flagging)
- The "Next session" pointer needs to advance

Treat changes here like changes to `CLAUDE.md` — rare, deliberate, and worth their own commit.
