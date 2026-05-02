# Handoff: Atrium · Aperture — Workspace landing

## Overview
Aperture is the **Workspace** landing page of an internal legal-ops product (working name "Atrium"). It greets the user, surfaces top-level workspace stats, and presents a grid of **department cards** as the primary navigation into deeper work. The layout is a fixed left navigation rail + a main content column with hero, stats, and a 3-column card grid.

## About the design files
The files bundled here are **design references created in HTML/JSX** — interactive prototypes that show the intended look, copy, and behavior. **They are not production code to copy directly.**

Your job is to **recreate this design in the target codebase's existing environment** (React, Vue, SwiftUI, native, etc.) using the codebase's established component library, styling system, and routing patterns. If the project has no established UI environment yet, pick the most appropriate framework for the team and implement the design there.

The HTML files are scaled by a "design canvas" wrapper that lets the user pan/zoom multiple artboards. The actual app screen is the inner `1440 × 900` artboard — that's the surface to recreate. **Ignore** the surrounding canvas chrome (`design-canvas.jsx`, `tweaks-panel.jsx`); they exist only for the prototype.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, copy, and hover behavior are all locked. Recreate pixel-faithfully where the codebase's design system permits, then let the design system override only where it has stronger conventions (e.g. button primitives, link styles).

## Screens / Views

### Workspace (single screen)
- **Purpose:** First screen after sign-in. The user lands here, sees workspace-wide status at a glance, then clicks a department card to drop into that area.
- **Canvas size:** 1440 × 900 (target desktop). Min usable width ~1280; below that, collapse the nav rail.

#### Layout
Two-column CSS grid:
- **Left rail** — fixed `232px` wide, full height, scrolls if overflow.
- **Main column** — `56px 1fr 36px` row grid: top bar / body / footer.

```
┌────────┬─────────────────────────────────────┐
│  rail  │  top bar (56)                       │
│ (232)  ├─────────────────────────────────────┤
│        │  body (scrolls)                     │
│        │    hero  +  stats                   │
│        │    section heading                  │
│        │    department grid (3 cols)         │
│        ├─────────────────────────────────────┤
│        │  footer (36)                        │
└────────┴─────────────────────────────────────┘
```

#### Components

##### Left navigation rail
- Background `#efeae1`, right border `1px #e8e2d4`. Padding `22px 14px`. Vertical flex with `gap: 22px`.
- **Brand mark** — `legalOS` (or your final brand name). 15px, weight 600, letter-spacing `-0.015em`. Preceded by a 7px circular dot in the slate-blue accent (`#3b5680`).
- **Group 1 — Workspace** (active)
  - Single link "Workspace" with glyph `⌂` and shortcut hint `⌘1`. Active state: background `#1a1816`, text `#f4f1ec`, weight 500.
- **Group 2 — Departments**
  - Section label: 10px IBM Plex Mono, uppercase, letter-spacing `0.14em`, color `#8a8174`.
  - One link per department, showing the department name and a right-aligned matter count in mono.
- **Group 3 — Resource links** (no label)
  - "Knowledge", "Matters / Deals" (with total count), "Inbox" (with count), "Resources".
- **Profile block** at the bottom — circular initials avatar (`#1a1816` bg, `#f4f1ec` text), name, role/title in 11px muted.

##### Top bar
- Padding `0 40px`. Bottom border `1px #e8e2d4`.
- **Left:** breadcrumb `workspace / **departments**` — 13px, muted slug + bold black active segment.
- **Right:** two muted 12.5px items separated by `gap: 22px`:
  - Live agents indicator — preceded by a pulsing 6px slate-blue dot (`#3b5680`, 1.8s ease-out infinite radial pulse).
  - Date string ("Friday · May 1").

##### Hero block (top of body)
- Padding `56px 56px 32px`. Vertical flex, `gap: 36px`.
- **Greet row** — flex `space-between`, `align-items: end`.
  - Left: `lbl` ("WORKSPACE", mono uppercase 11px, slate-blue, 0.16em tracking) → `h1` greeting → `sub` paragraph.
    - **h1**: Inter Tight, 52px, weight 400, letter-spacing `-0.03em`, line-height 1.02, max 22ch. Bolded phrase ("Two redlines") uses weight 500 and slate-blue color `#3b5680`.
    - **sub**: 14.5px, color `#6b6358`, line-height 1.5, max 56ch.
  - Right: three stats (Open, SLA at risk, Saved · MTD), right-aligned, gap 28px.
    - Key: 10px mono, uppercase, 0.14em tracking, color `#8a8174`.
    - Value: 26px, weight 500, letter-spacing `-0.02em`, color `#1a1816`.

##### Section heading ("Departments")
- Flex `space-between`, baseline-aligned.
- Bottom border `1px #e8e2d4`, bottom padding 10px.
- Title: 11px mono uppercase, 0.16em tracking, color `#6b6358`, weight 500.
- Right action: 13px slate-blue ("customize layout →"), weight 500.

##### Department card grid
- `display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;`
- One card per department.

##### Department card
- White background `#fff`, border `1px solid #ebe6dc`, border-radius `14px`, padding `22px`.
- Vertical flex, `gap: 16px`, `min-height: 192px`.
- Shadow (idle):
  ```
  0 1px 0 rgba(26,24,22,0.02),
  0 1px 3px rgba(26,24,22,0.04),
  0 8px 24px -8px rgba(26,24,22,0.06)
  ```
- **Card content:**
  - **Name** — Inter Tight 19px, weight 500, letter-spacing `-0.018em`, color `#1a1816`.
  - **Description** — 13px, color `#6b6358`, line-height 1.45, `flex: 1` so foot stays pinned.
  - **Foot row** — top border `1px #f0ebdf`, top padding 12px, flex `space-between`.
    - Left: `{count} reviews · {savedH}h saved` — 11px mono, color `#8a8174`, tabular numerals.
    - Right: 22px circular arrow "→" — idle bg `#f4f1ec`, color `#1a1816`.
- **Hover state** (transitions 220ms cubic-bezier(.2,.7,.2,1)):
  - `transform: translateY(-2px)`
  - border `#d8d2c7`
  - shadow lifts:
    ```
    0 1px 0 rgba(26,24,22,0.03),
    0 4px 8px rgba(26,24,22,0.06),
    0 22px 38px -12px rgba(26,24,22,0.12)
    ```
  - Foot arrow becomes filled black: bg `#1a1816`, color `#f4f1ec`, `translateX(2px)`.

##### Footer
- 36px tall, padding `0 40px`. Top border `1px #e8e2d4`. 11px mono, color `#8a8174`, 0.04em tracking.
- Left: `⌘K to command`, then `⌘1 workspace · ⌘M matters · ⌘I inbox`.
- Right (`margin-left: auto`, `gap: 22px`): `privilege enforced`, `build 26.04`.

## Departments (current set)
The departments array drives both the left nav and the card grid. Current entries:

| # | Name | Description (placeholder = `[ description ]`) |
|---|---|---|
| 1 | Commercial | sell-side, buy-side, NDAs |
| 2 | Public Sector | government relations, regulatory affairs, public sector commercial |
| 3 | Mergers & Acquisitions | `[ description ]` |
| 4 | Privacy | `[ description ]` |
| 5 | Product | `[ description ]` |
| 6 | Compliance | `[ description ]` |
| 7 | Operations | `[ description ]` |
| 8 | General Tools | `[ description ]` |

Each has `count` (matters/reviews open) and `savedH` (hours saved · MTD). Final descriptions and counts will come from the backend; treat as data, not literal copy.

## Interactions & behavior
- **Card click** → navigate to that department's workspace (route TBD by app).
- **Nav link click** → standard route navigation. Active link highlights as in the Workspace example.
- **Card hover** → lift + shadow grow + arrow inverts (see hover spec above). Pure CSS, no JS required.
- **Live agents dot** → infinite 1.8s pulse animation:
  ```css
  @keyframes va-pulse {
    0%   { box-shadow: 0 0 0 0 rgba(59,86,128,0.45); }
    70%  { box-shadow: 0 0 0 7px rgba(59,86,128,0); }
    100% { box-shadow: 0 0 0 0 rgba(59,86,128,0); }
  }
  ```
- **`⌘K`** opens a command palette (out of scope for this handoff — just leave the affordance in the footer).
- **Body scroll** — only the body region scrolls; rail and footer stay pinned.

## State management
Minimal for this view:
- `user` — name, initials, role for the rail profile block.
- `agentsRunning` — int, drives the top-bar live counter.
- `inboxCount` — int, drives the rail Inbox badge.
- `workspaceStats` — `{ open, slaAtRisk, savedMtd }` — drives the three hero stats.
- `departments` — array of `{ id, name, description, count, savedH, route }`.
- `greeting` — string with optional bolded phrase. The prototype uses `**double asterisks**` markdown for the highlight; in production, render the highlight as a styled span around the dynamic phrase (e.g. "Two redlines waiting" → bolded and slate-blue).

## Design tokens

### Colors
| Token | Hex | Use |
|---|---|---|
| `paper` | `#f4f1ec` | Page bg, arrow idle bg, dark-mode text |
| `paper-2` | `#fbf9f4` | Hover row tint |
| `stone` | `#efeae1` | Nav rail bg |
| `stone-2` | `#e8e2d4` | Hairlines (top bar, footer) |
| `stone-3` | `#e3ddd1` | Card outer border (chrome) |
| `card-border` | `#ebe6dc` | Card border |
| `card-divider` | `#f0ebdf` | Card foot top-border |
| `ink` | `#1a1816` | Primary text, nav active bg, arrow filled |
| `ink-2` | `#2c2925` | Nav link text |
| `mute` | `#6b6358` | Body / sub text |
| `mute-2` | `#8a8174` | Caption / mono text |
| `accent` | `#3b5680` | Slate-blue accent (live dot, brand dot, links, h1 highlight) |
| `accent-hover` | `#4a679a` | (used in older variants for hover gradients — not used in Aperture) |

### Typography
- **Display / UI:** `Inter Tight`, weights 300/400/450/500/600/700. `font-feature-settings: "ss01", "cv11"`.
- **Mono:** `IBM Plex Mono`, weights 400/500.
- **Hierarchy used in Aperture:**
  - h1 hero — 52 / 1.02, w400, `-0.03em`
  - Card name — 19, w500, `-0.018em`
  - Stat value — 26, w500, `-0.02em`
  - Body / desc — 13–14.5, w400, line-height 1.45–1.5
  - Section/lbl/foot mono — 10–11, uppercase, 0.12–0.16em tracking

### Spacing
- Gutter between cards: `14px`.
- Body padding: `56px 56px 32px`.
- Top bar / footer horizontal padding: `40px`.
- Rail padding: `22px 14px`.
- Card padding: `22px`.
- Section gap: `36px`.

### Radii
- Cards: `14px`.
- Card foot arrow: `50%` (22px circle).
- Nav links: `8px`.
- Avatar: `50%`.

### Shadows
- Card idle: `0 1px 0 rgba(26,24,22,0.02), 0 1px 3px rgba(26,24,22,0.04), 0 8px 24px -8px rgba(26,24,22,0.06)`.
- Card hover: `0 1px 0 rgba(26,24,22,0.03), 0 4px 8px rgba(26,24,22,0.06), 0 22px 38px -12px rgba(26,24,22,0.12)`.

### Motion
- Card transition: `220ms cubic-bezier(.2,.7,.2,1)` on `transform`, `box-shadow`, `border-color`.
- Foot arrow: `200ms ease` on `background`, `color`, `transform`.
- Pulse dot: `1.8s ease-out infinite`.

## Assets
None — the design is type, color, and shape only. No icons, illustrations, or imagery.

If your codebase has an icon system, the few text glyphs in the rail (`⌂`, `▤`, `∿`, `⊟`, `❒`) can be replaced with proper icons; they're text-as-icon placeholders in the prototype.

## Files in this handoff
- `atrium-aperture-final.html` — the production-ready landing page (entrypoint).
- `atrium-aperture-tweakable.jsx` — the Aperture component with props plumbed for live editing.
- `atrium-hybrid-departments.jsx` — original component file. **Contains `hybridLandingCss` (the full stylesheet) and the `.va` Aperture-specific styles** at the top. Lift the styles from here. Also contains other variant components (Marble, Pebble) the user did not pick — ignore those.
- `design-canvas.jsx`, `tweaks-panel.jsx` — prototype-only chrome. **Do not port.**

## Things to ignore in the prototype
- The pan/zoom canvas wrapper (`design-canvas.jsx`).
- The Tweaks panel (`tweaks-panel.jsx`) and the `useTweaks` hook — those are an in-prototype editor and aren't part of the product.
- `data-screen-label`, `data-cc-id`, `data-dm-ref`, `data-om-id` — instrumentation injected at runtime by the prototype host.
- The Marble and Pebble components in `atrium-hybrid-departments.jsx`.
- Any `EDITMODE-BEGIN/END` JSON blocks — those are prototype defaults plumbing.
