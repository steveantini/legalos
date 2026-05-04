# Chat surface — Aperture design spec

**Surface:** `/agents/<id>`
**Status:** Design brief, ready for implementation
**Author:** Aperture working group
**Pairs with:** `chat-aperture.html` (visual reference, four scenes)

The chat surface is the primary work surface in legalOS. Sessions run hours,
fifty-plus turns, with substantive markdown output, tool use, and citations.
This spec covers every state the user can land in.

It composes inside the workspace chrome already specified by the Aperture
handoff — left rail (232px, never collapses), top bar (48px, breadcrumb +
date/status), body wrapper with `px-14 pb-8 pt-14` padding. Nothing in this
spec replaces or overrides that chrome.

---

## 1 · Layout

### Body padding & column

The body wrapper keeps `px-14 pb-8 pt-14`. Inside it the chat is a single
flex column:

```
┌── workspace top bar (48px) ─────────────────────────┐
├── body padding pt-14 ───────────────────────────────┤
│  ┌── agent header strip (inside padding) ─────────┐ │
│  │  Agent name · description · meta chips · Edit  │ │
│  └────────────────────────────────────────────────┘ │
│  ┌── message list (flex-1, overflow-y) ───────────┐ │
│  │                                                │ │
│  │   ╔══ column · max-w-3xl · mx-auto ══╗         │ │
│  │   ║   You   ▸ user message            ║         │ │
│  │   ║   Agent ▸ assistant prose         ║         │ │
│  │   ╚════════════════════════════════════╝         │ │
│  └────────────────────────────────────────────────┘ │
│  ┌── composer · max-w-3xl · mx-auto ──────────────┐ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Column width:** changed from `max-w-4xl` (896px) to `max-w-3xl` (768px).
Legal prose at 14.5–15px on a 56–60ch column is the target. 4xl pushed a
typical line past 90 characters, which hurts long-read comprehension.
The composer matches column width; agent header matches column width.

**Header position:** inside the body padding, not stacked against the top
bar. The top bar is structural chrome (route + status); the agent header
is content (this conversation's subject). Different layers, separated by
the page padding.

### Two-speaker turn layout

Every turn is a 64px gutter for the speaker label + a flexible content
column. The 64px lane is monospace caps `YOU` or `AGENT`. This replaces
the symmetric "user-bubble-right / assistant-bubble-left" chat convention
because:

- Long pasted contracts as user input look broken right-aligned.
- Citations, code blocks, tables in assistant responses don't read in
  bubbles.
- Aperture's restraint asks for typographic structure, not chat-app shape.

User content sits in a tinted card (`#efeae1`, the rail tone — pulls it
visually toward "input" rather than "output"). Assistant content is
prose, no card, no bubble. The label gutter does the speaker work.

### Conversation navigation

For 50+ turn sessions, a sticky right-side mini-index is available
(out-of-flow, `margin-right: -160px` from the column, only renders when
viewport > 1280px and turn count > 8). Each entry is a monospaced
truncated user-message preview with turn number. Anchor-link to the turn.
Hidden when the right margin can't accommodate it.

---

## 2 · Components

### 2.1 Agent header (richer strip)

The thin border-bottom strip is replaced. New shape:

- **Name** — `Inter Tight 28 / 400`, `letter-spacing -0.025em`, line-height 1.05
- **Description** — `14 / 1.55 / muted-fg`, max 60ch
- **Meta chips** (row):
  - Model — `claude-sonnet-4-5` (mono caps)
  - Web search — chip with `slate-blue` accent + dot when on
  - Attachment count — `3 attached`
- **Edit link** — top-right, ghost button styling

Description and chips together replace the "thin strip + edit link"
pattern. Total header height ≈ 92px, separated from the message list
by a 16px bottom border.

**Soft-deleted variant:**

- Wrap header in a card (`#f0ebdf` background, 1px `#d8d2c7` border, 10px radius)
- Replace meta chips with a single banner: `archived · transcript retained for record · no new turns accepted`
- Banner color: `#8a3a3a` (the existing aperture warning tone)
- Composer is disabled (see §2.7)

One-click-away (lives in a popover off the Edit link, or off a `…` menu):
description full text, system prompt summary, full attachment list,
last-edited metadata.

### 2.2 User turn

```jsx
<turn>
  <who>You</who>
  <userBody>{text}</userBody>
</turn>
```

- Speaker label `YOU` in `slate-blue` (the only place YOU shows in slate)
- Body card: `bg #efeae1`, border `#ebe6dc`, radius 10px, padding 12 16
- `white-space: pre-wrap` to preserve pasted contract formatting
- No avatar, no timestamp inline. (Hover-reveal timestamp, see §2.10.)

### 2.3 Assistant turn — prose

The prose column is the heart of the surface. Type ramp:

| Element | Size | Weight | LH | LS | Notes |
|---|---|---|---|---|---|
| `p`           | 14.5 | 400 | 1.65 | 0       | body |
| `h2`          | 18   | 500 | 1.2  | -0.018  | section |
| `h3`          | 15   | 500 | 1.3  | -0.012  | subsection |
| `h4`          | 14   | 500 | 1.35 | -0.005  | rare |
| `strong`      | —    | 600 | —    | —       | emphasis |
| `em`          | —    | 400 | —    | —       | italic |
| inline `code` | 12.5 | 400 | —    | —       | mono, tinted bg |
| `pre`         | 12.5 | 400 | 1.55 | —       | mono, dark |
| `blockquote`  | 14.5 | 400 | 1.6  | —       | left rule |
| `table`       | 13.5 | 400 | 1.45 | —       | small caps headers |

Lists use custom bullets (5px slate dot) and tabular numerals on `ol`
counters. No prose grays from a default `prose` plugin — every color
is from the Aperture palette.

**Code blocks** are dark (`#1a1816` bg, `#ece8de` text). This is the
only inverted surface in chat; it's earned because legal redlines and
clause comparisons render here and benefit from the visual "shift to
data" cue. Syntax tokens use a restrained palette: keyword `#b8c6dd`,
string `#d4c49c`, comment `#8a8174`. Diff markers (`+`/`-`) keep the
existing character syntax — no green/red highlighting. This matches
how lawyers read redlines on paper.

**Tables** use small-caps mono headers and a hairline border grid.
Recommended for clause-by-clause comparisons.

### 2.4 Citations

**Visual:** inline superscript marker, monospace, slate-blue.

```
…must be updated to reference Decision 2021/914 [4] [5].
```

- 9.5px Geist Mono, weight 500
- Background `rgba(59,86,128,0.08)`, border `rgba(59,86,128,0.18)`, radius 4px
- Padding `1px 5px`, vertical-align `super`
- Hover: bg darkens to `rgba(...,0.18)` (180ms ease)
- Click: opens source (web → new tab; doc → side panel — future)

**Persistence:** each citation marker is a real anchor on the message
record, not transient stream state. Render shape: `<a class="cite"
data-source-id="..." href={url}>{n}</a>`. The number is the index into
the message's `sources` array, computed at message-save time, stable
forever after. Stream-time renders the same shape with provisional
numbers; final-save reconciles.

**Footnote list** at message end:

```
SOURCES
1   Acme — Schedule 2 (Technical & Organisational Measures)   acme-vendor-dpa-2026.pdf · p.14
2   Acme — Clause 7 Sub-processors                              acme-vendor-dpa-2026.pdf · p.6
3   EDPB Guidelines 07/2020 …                                   edpb.europa.eu
…
```

- Top border `1px #ebe6dc`, 18px space above
- Header `SOURCES` in mono caps, `8a8174`
- 3-column grid: 22px number lane / title / domain
- Number in slate-blue mono
- Title is a link (no underline; underline on hover)
- Domain in mono `#8a8174`, right-aligned, never wraps

**Edge case (15–20 sources):** show the first 5, fold the remainder.
A monospace `show 12 more →` link reveals all. Fold state is per-message,
not persisted.

### 2.5 Tool-use trace

Default collapsed. Single-row status with spinner / check / error icon.

```
○ Searching the web for "EDPB sub-processor 30 day notice"   0.8s   ›
```

- 14px circular icon: spinning ring while running, slate-blue checkmark
  when done, warning ring when failed
- Label in display, argument in mono, elapsed time in mono `#8a8174`
- Click anywhere to expand
- Expanded section shows inputs / outputs / error message
- 220ms ease on rotate-chevron, 180ms ease on background hover

Bordered card in `#fbf9f4`. Sits above the prose response — the
assistant's "thinking" is a sibling block, not part of the prose flow.
A turn can have multiple tool blocks before its prose body.

### 2.6 Streaming states

**Waiting for first token** — three pulsing dots in the assistant lane,
no caret, no prose yet. Pure CSS animation, staggered 180ms.

**Actively streaming** — prose renders token-by-token. A blinking caret
(7×~17px solid block, blink at 1s steps(2)) trails the last token.
Caret is the only "the model is still going" indicator besides the
top-bar status pill.

**Tool use mid-stream** — the tool trace card slots into the prose flow
at the position the model invoked it. Once complete, prose resumes
below it.

**Stop button** — appears in the composer's right-tools rail during any
streaming activity. Replaces the send button. Mono caps `STOP` with a
2px filled square. Click sends interrupt.

### 2.7 Composer

Visual:

- `max-w-3xl` matching the column
- White card (`#fff`), 1px `#d8d2c7` border, 14px radius
- Soft shadow: `0 1px 2px rgba(0,0,0,0.04), 0 12px 28px -14px rgba(0,0,0,0.10)`
- Focus-within: border slate-blue at 0.45α, plus a 3px slate-blue glow at 0.08α
- 200ms ease on focus state inversion

Anatomy (top to bottom):

1. Textarea — auto-grow from 56px to 220px, then internal scroll
2. Tools row:
   - Left: persistent attachment chips, web-search toggle
   - Right: model picker, send/stop button
3. Hint row: keyboard hint in mono caps

**Keyboard contract** (overrides current Enter-sends behavior):

- `⌘+Return` / `Ctrl+Return` → send
- `Return` alone → newline
- `Esc` while streaming → stop generation

This deviates from chat convention because legal text is long and
deliberate. The keyboard hint reinforces the contract.

**Attachment chips** — persistent (per agent, not per message). Chip
styling: 12px display name + 11px mono size, 6px gap, `#f4f1ec` fill.
Overflow chip: `+N` at the end. Read-only here; full management lives
in agent edit.

**Web-search toggle** — mono caps button, slate-blue when on (the only
slate-blue active-state in the composer):

- Off: muted-fg, no border
- On: slate-blue text, slate-blue border at 0.2α, slate-blue tint bg

**Model picker** — mono caps, ghost button with chevron. Opens a
shadcn `DropdownMenu` (visual styling overridden to Aperture tokens).

**Send button** — 36×36 dark square (`#1a1816` bg, `#f4f1ec` icon).
- Disabled (empty input or streaming): `#d8d2c7` fill, `#8a8174` icon
- Hover (enabled): no transform — only color via `box-shadow`
- 200ms ease on enable/disable transition

Send is an icon, not text. (The icon is the send arrow — a single
literal upward arrowhead. This is the one decorative-feeling icon
the spec retains because the affordance is universal and the
keyboard hint covers the labeled path.)

**Disabled state (archived agent):**
- Card opacity 0.7, fill switches to `#f4f1ec`
- Textarea shows the archived message instead of placeholder
- Send disabled, both tool buttons hidden
- No focus ring

**Draft autosave:** localStorage keyed by `legalos.draft.<agentId>`.
Restores on mount, clears on send. No visible "draft saved" toast —
the absence of data loss is the affordance.

### 2.8 Empty state

When the conversation has zero messages, the message list area is
replaced with a centered identity panel:

- Lead: `Start with [Agent name].` — 32px display, agent name in
  slate-blue at weight 500
- Description — full agent description, 14.5px
- Facts row — three columns: Model / Web search / Last updated
- File list — each attachment as a row card with name + size

No suggested prompts (no curation today). The agent's identity is
the empty state.

### 2.9 Error states

All errors share the same banner pattern:

- 1px border `rgba(138,58,58,0.3)`, bg `#f9f0ec`, 10px radius
- Three-column grid: 16px icon / message / retry button
- Icon: 14px circular outline with `!` glyph in mono
- Message: display, `#6e2e2e`. Bold lead + sentence explanation.
- Retry: mono caps button, ghost styling

Banner placement varies by source:

- **API error before send** — banner appears between composer and
  message list, push-down (not over).
- **Stream interrupted** — banner appears at the end of the partial
  assistant turn, after the text that did arrive.
- **Tool error** — the tool trace card itself flips to error state
  (red ring icon). A retry option lives in the expanded detail.

Restraint: no scary red, no shake animation. The banner is a
conversational acknowledgment, not an alarm.

### 2.10 Hover-reveal metadata

Timestamps, "copy message", "regenerate" (out of scope), and download
single-message live behind a hover affordance:

- On turn hover (200ms enter delay), a 22px vertical stack of mono-cap
  buttons appears in the speaker-label gutter, below the `YOU` / `AGENT`
  label
- 180ms fade in/out
- Buttons: timestamp (read-only), copy (icon-only, mono), download
  (icon-only)

This keeps the resting state clean. Don't add any of these to the
permanent layout.

---

## 3 · Tokens

### 3.1 Existing tokens used

| Role | Value | Usage |
|---|---|---|
| `background` | `#f4f1ec` | page |
| `surface` | `#efeae1` | rail, user-bubble |
| `surface-soft` | `#fbf9f4` | tool card, chips, model picker |
| `surface-card` | `#fff` | composer |
| `border` | `#ebe6dc` | hairlines |
| `border-strong` | `#d8d2c7` | composer, archived header |
| `fg` | `#1a1816` | body, headings |
| `fg-muted` | `#6b6358` | secondary text |
| `fg-quiet` | `#8a8174` | tertiary, mono labels |
| `fg-faint` | `#c8c0b1` | bullets, dividers |
| `accent-slate` | `#3b5680` | citations, web-search-on, YOU label, links |
| `warn-fg` | `#8a3a3a` | error icon, archive banner |
| `warn-fg-deep` | `#6e2e2e` | error message body |
| `warn-bg` | `#f9f0ec` | error banner fill |

### 3.2 Tokens · net-new

These five are introduced by this spec. Names align to the existing
naming convention.

| Name | Value | Why net-new |
|---|---|---|
| `--chat-user-bubble-bg`           | `#efeae1` | Aliases `surface`, but call-site is "user message body" — alias makes intent explicit and lets us tune the user-bubble independently if needed. |
| `--chat-prose-fg`                 | `#1a1816` | Aliases `fg`. Same intent argument. |
| `--chat-code-bg`                  | `#1a1816` | Inverted code surface. Currently no token has this role. |
| `--chat-code-fg`                  | `#ece8de` | Inverted code text. |
| `--chat-cite-bg`                  | `rgba(59,86,128,0.08)` | Citation chip fill. Composes from `accent-slate` α-stack but the α-mix is reused in the `.cite` hover state and worth pinning. |

Code-block syntax tokens (`--code-kw`, `--code-str`, `--code-com`) are
defined inline only at the prose-renderer level and do not need to
escape into the broader token system.

---

## 4 · Motion

Aperture motion contract is preserved exactly:

| Transition | Duration | Easing |
|---|---|---|
| Hover state (button bg, citation bg, tool-card bg) | 180ms | `ease` |
| Focus state (composer border + glow) | 200ms | `ease` |
| Tool-card chevron rotate | 220ms | `cubic-bezier(.2,.7,.2,1)` |
| Tool-card detail open | 220ms | `cubic-bezier(.2,.7,.2,1)` |
| Send button enable/disable color shift | 200ms | `ease` |
| Hover-reveal turn metadata fade | 180ms | `ease` |
| Streaming caret blink | 1s | `steps(2)` |
| Typing-indicator pulse | 1.4s | `ease-in-out`, staggered 180ms |
| Tool-icon spinner | 1s | `linear` |

No transforms on hover except the chevron. No spring easings. No
bouncy entrances. Caret blink is `steps(2)` so it's discrete, not a
soft fade — that fits Aperture's typewriter-tone better than a
sinusoidal pulse.

---

## 5 · Interaction contracts (handoff to engineering)

1. Citations render as `<a data-source-id>` linking out (web) or
   triggering an in-app side panel (future, doc attachments). The
   superscript number is positional — index into the message's
   `sources` array stored on the message record.
2. Tool-trace state machine: `pending → running → done | error`. Default
   collapsed. Open state is local component state, not persisted.
3. Composer textarea uses `field-sizing: content` where supported,
   falling back to JS height-sync. Min 56px, max 220px, then internal scroll.
4. `⌘+Return` is the only send path. Build-time check in tests; do
   not let this drift back to plain Enter.
5. Stop button posts an abort to the SSE stream. The partial message
   is preserved at whatever token boundary it stopped at — display
   exactly that, no "[stopped by user]" footer. The user knows.
6. Drafts: `localStorage.setItem('legalos.draft.' + agentId, value)`
   on every change (debounced 200ms). `removeItem` on successful send.
   Read on mount.
7. Archived agents render the same chrome with composer disabled and
   header in deleted-variant. Server returns 403 on any send attempt
   — the client should not allow the action, but the server is the
   source of truth.

---

## 6 · Open decisions deferred

These are out of scope for this spec but should be revisited:

- **Inline PDF rendering** — design accommodates (tool trace expands to
  show document content) but does not solve. Likely a side-panel
  pattern, not inline in the message column.
- **Document-attachment citations** — same visual treatment as web
  citations, but the click target is an in-app preview, not a new tab.
  Side panel or modal — TBD.
- **Conversation export** — confirmed out of scope.
- **Regenerate / edit-and-resend** — confirmed out of scope.
- **Branching conversations** — confirmed out of scope. If revived,
  the linear turn-list assumption breaks and so does the turn-index
  navigation; design will need a tree affordance.

---

## 7 · Review checklist

Before merging chat into the workspace:

- [ ] Column width changed from `max-w-4xl` to `max-w-3xl`
- [ ] Agent header replaces the thin strip in three states (active / archived / loading)
- [ ] User turn renders as label + tinted card, no avatar, no timestamp
- [ ] Assistant prose uses the type ramp from §2.3 — not the default `@tailwind/typography` defaults
- [ ] Citations render inline as superscript markers and as a footnote list at message end
- [ ] Citation persistence verified against page reload (the stated bug is fixed before sign-off)
- [ ] Tool traces collapsible, default collapsed, three states (running/done/error)
- [ ] Composer is `⌘+Return` to send, `Return` for newline (current code does the opposite — must change)
- [ ] Composer disabled state matches archived-agent header
- [ ] Drafts persist per-agent in localStorage and clear on send
- [ ] Empty state surfaces agent identity, no canned prompts
- [ ] Stop button replaces send during streaming, posts abort to SSE
- [ ] Web search toggle uses slate-blue when on, neutral when off
- [ ] Error banners use the warn tokens, no red, no shake
- [ ] All motion durations match §4 — verify against existing components
