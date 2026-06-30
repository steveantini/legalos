# Handoff: legalOS Landing — Platform & Control Sections

## Overview
This is the "below the hero" portion of the legalOS marketing landing page (the operating system for corporate legal departments). It adds two stacked sections between the hero's **Enter workspace** CTA and the footer:

1. **Inside the platform** — four alternating rows, each pairing a short label/description with a full, idealized product *window* (the real app chrome: left rail + breadcrumb top bar + a surface). The four surfaces are Workspace, Departments, Knowledge, Workflows.
2. **Control on your terms** — a three-facet flexibility strip (model-agnostic · connect your drives · governed by default), followed by a full-width **admin/backend** product window.

The windows are *idealized representations* of each surface — they capture the feeling and one or two hero elements, simplified and beautiful, not literal screenshots. Each window is a clean, self-contained frame (a future product-video clip could drop into the same slot).

## About the Design Files
The files in this bundle are **design references created in HTML/React-via-Babel** — a prototype showing intended look and behavior, **not production code to copy directly**. The task is to **recreate these designs in the legalOS codebase** (Next.js + React + Tailwind v4, the same stack the prototype was modeled on) using its established components, tokens, and patterns. Much of this prototype was built by mirroring real shipping components (`impact-band`, `department-card`, `structured-query-result`, `run-approval-card`, `admin-rail`, `analytics-tiles`), so prefer reusing those real components over rebuilding from this mock.

The prototype is plain React rendered through in-browser Babel for previewing; do **not** ship the Babel/CDN setup. Reimplement as normal Next.js client/server components.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, and layout. Recreate pixel-closely using the codebase's existing libraries and design tokens. The one caveat: the placeholder data (numbers, matter names, people names) is illustrative — wire to real data or replace with the team's preferred sample content.

## Tech & Conventions to match
- **Framework:** Next.js App Router, React, TypeScript.
- **Styling:** Tailwind v4 with the existing `@theme` tokens in `app/globals.css` (the "Aperture" palette). Use the CSS variables already defined there rather than the raw oklch values below — those values are transcribed *from* that file for reference.
- **Fonts:** Inter Tight (display/sans) and Geist Mono (mono), already loaded in `app/layout.tsx`.
- **House style:** no em-dashes in copy (the codebase enforces this); use commas, periods, or "to" for ranges. The mono-caps eyebrow labels (uppercase, letter-spaced Geist Mono) are the product's signature motif — keep them.
- **Single accent:** deep navy, used sparingly (one word, one dot, one arrow, one active state). Never colorful, no decorative gradients.

## Layout

### Page shell
- Single centered column, `max-width: 1340px`, `margin: 0 auto`, horizontal padding `40px`. **Topbar, hero, both new sections, and footer all share this same column** so every left edge aligns. This alignment was a deliberate fix — do not let any band go full-bleed or hard-left independently.
- Background: page canvas `--background`. The Control section uses the slightly recessed ground (`paper2`) to separate it from the platform section.

### "Inside the platform" section
- Padding `76px 40px 84px`. Section header (eyebrow + h2 + lead paragraph), then a vertical stack of four rows with `64px` gap.
- **Section header:** eyebrow `INSIDE THE PLATFORM` (navy mono-caps); h2 "Everything your department runs on, in **one place**." (max-width ~24ch so it wraps to 2–3 lines, "one place" in navy + weight 500); lead paragraph (muted, ~58ch).
- **Each row:** CSS grid, two columns, `align-items: center`, `gap: 52px`.
  - Even rows (0, 2): `grid-template-columns: 1.95fr 1fr` — window left, text right.
  - Odd rows (1, 3): add class `rev` → `grid-template-columns: 1fr 1.95fr` — text left, window right. Text column is right-aligned (`align-items: flex-end; text-align: right`).
  - **Responsive:** at `max-width: 1180px`, both collapse to a single column; **text always orders ABOVE the window** (`.los-text { order: 1 }`, `.los-win { order: 2 }`), left-aligned. This was an explicit requirement.
- **Text column** (`.los-text`): an inline row of `NN` (mono, caption) + a 22px hairline rule + `EYEBROW` (navy mono-caps); an h3 title (28px, weight 400, letter-spacing -.025em, ~15ch); a description paragraph (15px, muted, ~38ch).

### "Control on your terms" section
- Background `paper2`, top hairline, padding `76px 40px 84px`, inner column gap `52px`.
- **Header:** eyebrow `CONTROL ON YOUR TERMS`; h2 "Meets your department **where it already is**." (~22ch); lead paragraph (~54ch).
- **Three facets:** `grid-template-columns: 1fr 1fr 1fr`, `gap: 48px`. Each facet = navy mono-caps tag, 21px title (weight 450), ~36ch body, and a wrapping row of "chips" (8px gap). Chips: card bg, 1px border, radius 8, padding `8px 12px`, 12.5px label.
  - MODEL-AGNOSTIC — "Run on the models you choose" — chips: Claude, GPT, Gemini, Llama, Your key.
  - CONNECT YOUR DRIVES — "Point it at the drives you use" — chips: Google Drive, SharePoint, iManage, NetDocuments, Box.
  - GOVERNED BY DEFAULT — "Reads free, writes pause for you" — chips: SSO, Role-based access, Audit log.
- **Backend block:** a left-aligned mini-header (eyebrow `THE BACKEND`, h3 "Built for the people who run it", body ~52ch), then the full-width admin window.

### The product window (`AppWindow`)
A panel with `border-radius: 16px`, 1px `hairStrong` border, soft layered shadow (`0 50px 80px -44px rgba(40,52,80,.34)` is the deep one), `overflow: hidden`, `min-height: 440px`, `display: flex`.
- **Left rail:** `width: 196px`, right hairline border, padding `20px 12px`, vertical groups with `20px` gap. Brand row (7px navy dot + "legalOS" wordmark), then grouped nav: a caption row (mono-caps, 10.5px) + nav rows. Nav row: `7px 10px` padding, radius 8, 13px label; **active row = solid ink (near-black) background, paper foreground**; hover = hairline fill. Optional right-aligned mono count. Bottom: avatar (ink circle, initials) + name + mono-caps role, separated by a top hairline.
- **Top bar:** height 52, bottom hairline, padding `0 24px`. Breadcrumbs (slash-separated, last crumb ink + weight 500, earlier muted). Right side: "Monday · Jun 29" mono caption.
- **Main:** `flex: 1`, padding `26px 28px 30px`.
- The admin variant swaps the rail (`AdminRail`): groups GOVERN (People, Policy & access) and MEASURE (Insights, Evals), role caption "ADMIN · OWNER".

## Screens / Surfaces (the window contents)

### 1 · Workspace — "The daily home"
- h1 greeting "Good afternoon, **Steven**." (Steven in navy), weight 400, 30px, letter-spacing -.03em; muted sub-paragraph mentioning legalOS in navy.
- **Impact band:** caption `YOUR IMPACT · THIS QUARTER`, then a card (radius 14, border, soft shadow) split into 3 equal cells divided by 1px dividers. Each cell = a `Stat`: mono-caps label (10px), big value (28px, weight 400, tabular-nums) + optional mono suffix, navy hint line (11px). Values: HOURS SAVED 142 hrs "+18 vs last quarter"; EST. COST SAVED $48.2K "vs. outside counsel"; AGENT RUNS 1,204 "97% with no edits".
- **Needs you** list: header row ("Needs you" + navy "All matters →"), then rows of `[type badge] [title] [due]`. Badge = ink pill, paper mono text (MPA, DPA). Hover = hairline fill.

### 2 · Departments — "Agents, organized like a team"
- h1 "Departments" (22px, weight 500) + muted intro ("Thirty agents across six practice areas").
- **3-column grid** (`1fr 1fr 1fr`, gap 14) of six cards. Card: card bg, border, radius 14, padding 18, min-height 150, hover-lift. Contents: 17px name (weight 500), muted 12.5px description, footer (top hairline) with "N agents" mono + a 22px circular `→` chip. Six: Commercial 8, Corporate 5, Privacy 6, Litigation 4, Intellectual Property 3, Employment 4.

### 3 · Knowledge — "Ask your own documents" (Structured Query active)
- h1 "Knowledge" + muted intro.
- **Two tool cards** (`1fr 1fr`, gap 12): "Research" (READS · REASONS, non-deterministic) and "Structured Query" (EXACT · REPEATABLE, deterministic) — the active one has a **navy border + soft navy shadow**.
- **Question card** (`paper2` bg): caption "QUESTION", then "How many active NDAs expire in Q3?" (15px).
- **Exact answer card:** big "37" (34px tabular-nums) + "of 1,204 documents"; an "Interpreted as:" line restating the query as a precise filter.
- **Matching documents:** caption + one row card: doc name (weight 500), "Expiry: Aug 14, 2026", and a left-bordered quoted snippet "…shall remain in effect until August 14, 2026… (verified against the source)".

### 4 · Workflows — "Work that waits for you" (a paused run)
- Header: h1 "Renewal sweep" + muted intro, and a navy "PAUSED" pill (mono-caps, navy dot, citeBg fill, citeBorder, radius 99).
- **Two columns** (`1.55fr 1fr`, gap 28, align start):
  - **Left — vertical step rail:** a 24px gutter column (dot + connecting line) beside step content. Step 1 AGENT (done: filled ink dot + ✓) "Extract renewal terms from 142 contracts". **Approval step** — a navy callout card (citeBorder border, citeBg fill, radius 10): "?" ringed icon, `PAUSED · FOR YOUR APPROVAL` mono-caps, body text, a left-bordered detail line, and two buttons (Approve = ink solid, Deny = outline). Step 3 ACTION (pending: hollow dot) "Schedule reminders and notify matter owners", "Queued · waiting on approval", last (no trailing line).
  - **Right — Run details** sidebar (`paper2` bg, radius 12): caption `RUN DETAILS`, then key/value pairs (TRIGGER Manual · Steven A.; SCOPE Commercial · 142 contracts; AUTONOMY Supervised; STARTED Today · 09:58; STEP 2 of 3); a top-bordered footnote "Every write pauses for approval, in every autonomy mode."

### 5 · Admin — "Built for the people who run it" (the backend)
- Uses `AdminRail`. h1 "Admin" + muted intro ("Govern access and measure adoption from one control center. Real, measured usage. Least-privilege by default.").
- **Insights band:** a 4-cell card (like the impact band) — ADOPTION 86% "17 of 20 active"; AGENT RUNS 1,204 "last 30 days"; HOURS GIVEN BACK 142 hrs "measured"; MONTHLY SPEND $2,140 "run-rate".
- **Govern + audit row** (`1fr 1fr 1.15fr`, gap 14, align start): two hover-lift cards — "People & roles" (GOVERN · PEOPLE) and "Policy & access" (GOVERN · POLICY) — plus an **Audit log** panel (`paper2` bg): caption + rows of `[navy dot] [title + timestamp] [detail]`. Rows: Role changed / "Priya Nair promoted to Admin" / 2h ago; Connection set read-only / "NetDocuments, org-wide" / Yesterday; Member deactivated / "Contractor offboarded, access revoked" / Jun 24.

## Interactions & Behavior
- **Hover-lift** (`.los-lift`): cards translateY(-2px), navy-tinted border, deeper shadow, `transition .36s cubic-bezier(.23,1,.43,1)`.
- **Nav/list rows** (`.los-navrow`): background fill to hairline on hover, `transition .12s`.
- **CTA** (`.los-cta`): translateY(-1px) + darken to `ink2` on hover.
- **Glyph:** concentric navy rings + center dot, with three expanding ring pulses (`@keyframes los-ring`, 4.2s, staggered). Decorative; honor `prefers-reduced-motion` by disabling the loop.
- **Responsive:** the only breakpoint is `1180px` (rows collapse to single column, text above window). Above it, rows are two-column with alternating sides.
- No routing/state in the prototype beyond hover. In production these windows are static marketing visuals (not live app embeds).

## Design Tokens
Transcribed from `app/globals.css` `:root` (the Aperture palette). **Prefer the existing CSS variables** over these literals.
- Background / canvas: `oklch(0.9712 0.0074 80.7209)`
- Recessed ground (paper2): `oklch(0.9995 0.0069 88.6418)`
- Card: `oklch(0.9993 0.0046 80.7209)`
- Ink (foreground): `oklch(0.2106 0.0050 67.5509)`; ink2 `oklch(0.2827 0.0084 75.2446)`
- Muted text: `oklch(0.5038 0.0198 75.9505)`; caption `oklch(0.6074 0.0221 77.2148)`
- **Primary (navy accent):** `oklch(0.4512 0.0766 258.9642)` (~#3b5680); hover `oklch(0.5141 0.0884 261.1831)`; on-primary `oklch(0.9841 0.0074 80.7209)`
- Navy tint fills: citeBg `oklch(0.4512 0.0766 258.9642 / 0.08)`; citeBorder `oklch(0.4512 0.0766 258.9642 / 0.18)`
- Hairlines: hair `oklch(0.9319 0.0198 87.5179)`; hairStrong `oklch(0.9240 0.0174 84.5888)`; divider `oklch(0.9657 0.0169 88.0008)`; border `oklch(0.9511 0.0144 84.5843)`
- **Type scale:** hero h1 64/1.04; section h2 42/1.08; surface h1 22; row h3 28; facet title 21; body 15–17; window body 12.5–14; mono labels 9–11 uppercase, letter-spacing .1–.2em. Display weights 400–500 (never heavier for headings); negative letter-spacing on large type (-.02 to -.03em).
- **Radii:** window 16; cards 12–14; chips/buttons 8; pills 99.
- **Shadows:** soft layered; window deep shadow `0 50px 80px -44px rgba(40,52,80,.34)`; card `0 8px 24px -8px rgba(26,24,22,.06)`.
- **Spacing:** column max 1340, pad 40; section pad 76–84 vertical; row gap 64; grid gaps 12–48.

## Assets
- **No raster/stock imagery.** The only graphic is the **glyph** (concentric rings + dot), drawn as inline SVG — reuse the codebase's existing `LandingGlyph` component instead of this copy.
- **Wordmark:** "legalOS" set in Inter Tight; use the codebase's `Wordmark`/`Brand` component.
- Icons: a couple of inline SVGs (arrow). Replace with the codebase's icon set (lucide).

## Files in this bundle
- `legalOS-Landing-standalone.html` — the full prototype, self-contained (open in any browser to view the target design).
- `legalOS Landing - Platform Section.html` — the source HTML entry (loads the JSX below via Babel).
- `os/legalos-real.jsx` — tokens (`T`), shared CSS, primitives (`Mono`, `Brand`, `Glyph`, `Avatar`), the rail/admin-rail/top-bar, and the `AppWindow` shell. **Start here for tokens and the window chrome.**
- `os/legalos-surfaces.jsx` — the five surface contents (Workspace, Departments, Knowledge, Workflows, Admin) plus the shared `Stat`.
- `os/legalos-page.jsx` — page composition: topbar, hero, the two sections, footer, and the responsive row classes.

Implement against the real components where they exist; use these files for exact layout, copy, spacing, and token values.
