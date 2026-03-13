# Web Accessibility (WCAG 2.1 AA)

---
version: 1.0.0
last_updated: 2026-03-06
applicability: All web projects, WCAG 2.1 Level AA compliance
dependencies: None (framework-agnostic patterns, React/Next.js examples included)
---

## Semantic HTML

Use the correct HTML element for its purpose. Semantic elements provide built-in accessibility, keyboard behavior, and screen reader announcements.

### Landmark Elements

```html
<header>         <!-- Site header, maps to role="banner" -->
<nav>            <!-- Navigation, maps to role="navigation" -->
<main>           <!-- Primary content, maps to role="main" (one per page) -->
<aside>          <!-- Sidebar/complementary, maps to role="complementary" -->
<footer>         <!-- Site footer, maps to role="contentinfo" -->
<section>        <!-- Thematic grouping, use with a heading -->
<article>        <!-- Self-contained content (blog post, card, comment) -->
```

**Rules**:
- Every page must have exactly one `<main>`
- Use `<nav>` for primary, secondary, and breadcrumb navigation
- Label multiple landmarks of the same type with `aria-label` or `aria-labelledby`

```tsx
<nav aria-label="Primary">...</nav>
<nav aria-label="Breadcrumb">...</nav>
```

### Headings

- Use one `<h1>` per page (the page title)
- Follow heading hierarchy: `h1` > `h2` > `h3` -- do NOT skip levels
- Headings define the document outline; screen reader users navigate by headings

```tsx
// WRONG: skipped h2
<h1>Dashboard</h1>
<h3>Recent Activity</h3>

// CORRECT
<h1>Dashboard</h1>
<h2>Recent Activity</h2>
<h3>Today</h3>
```

### Common Semantic Choices

| Need | Use | Not |
|------|-----|----|
| Clickable action | `<button>` | `<div onClick>` |
| Navigation link | `<a href>` | `<span onClick>` |
| List of items | `<ul>` / `<ol>` | Nested `<div>`s |
| Data in rows/columns | `<table>` | Grid of `<div>`s |
| User input | `<input>`, `<select>`, `<textarea>` | Custom `<div>` |
| Description term/detail | `<dl>`, `<dt>`, `<dd>` | `<div>` pairs |
| Time reference | `<time datetime="...">` | Plain text |

## ARIA

ARIA supplements semantic HTML. The first rule of ARIA: **do NOT use ARIA if a native HTML element provides the semantics**.

### Common ARIA Attributes

```tsx
// Labeling
aria-label="Close dialog"           // Label when no visible text
aria-labelledby="heading-id"        // Reference visible text element
aria-describedby="help-text-id"     // Additional description

// State
aria-expanded="true|false"          // Disclosure (accordion, dropdown)
aria-selected="true|false"          // Tabs, listbox items
aria-checked="true|false|mixed"     // Checkboxes, switches
aria-pressed="true|false"           // Toggle buttons
aria-disabled="true"                // Disabled (use with actual disabled behavior)
aria-hidden="true"                  // Hide from assistive tech (not visual)
aria-current="page|step|true"       // Current item in a set

// Relationships
aria-controls="panel-id"            // Element this controls
aria-owns="child-id"                // Virtual parent-child (rare)
aria-live="polite|assertive"        // Live region for dynamic updates
aria-busy="true|false"              // Content is loading/updating

// Roles (use sparingly -- prefer semantic HTML)
role="alert"                        // Urgent notification
role="status"                       // Non-urgent status update
role="dialog"                       // Modal dialog
role="tablist" / role="tab" / role="tabpanel"
role="menu" / role="menuitem"       // Application-style menus only
```

### ARIA Patterns

**Disclosure (Accordion)**:
```tsx
<button aria-expanded={isOpen} aria-controls="panel-1">
  Section Title
</button>
<div id="panel-1" role="region" hidden={!isOpen}>
  Panel content
</div>
```

**Tabs**:
```tsx
<div role="tablist" aria-label="Account settings">
  <button role="tab" aria-selected={active === 0} aria-controls="panel-0" id="tab-0">
    Profile
  </button>
  <button role="tab" aria-selected={active === 1} aria-controls="panel-1" id="tab-1">
    Security
  </button>
</div>
<div role="tabpanel" id="panel-0" aria-labelledby="tab-0" tabIndex={0}>
  Profile content
</div>
```

**Tooltip**:
```tsx
<button aria-describedby="tooltip-1">
  <InfoIcon />
</button>
<div role="tooltip" id="tooltip-1">
  More information about this feature
</div>
```

## Keyboard Navigation

### Requirements (WCAG 2.1.1 & 2.1.2)

- All interactive elements must be reachable via keyboard (Tab / Shift+Tab)
- All functionality available via mouse must be available via keyboard
- No keyboard traps (user can always Tab away, except in modals with focus trapping)

### Expected Keyboard Behavior

| Element | Keys |
|---------|------|
| Link | Enter to activate |
| Button | Enter or Space to activate |
| Checkbox | Space to toggle |
| Radio group | Arrow keys to move, Space to select |
| Select/dropdown | Arrow keys, Enter, Escape |
| Tab list | Arrow keys between tabs, Enter/Space to activate |
| Dialog/modal | Escape to close, Tab cycles within |
| Menu | Arrow keys to navigate, Enter to select, Escape to close |
| Slider | Arrow keys to adjust |

### `tabIndex` Rules

| Value | Behavior |
|-------|----------|
| `0` | Adds element to natural tab order |
| `-1` | Focusable via JS (`.focus()`), but NOT in tab order |
| Positive values | **NEVER use** -- breaks natural order |

```tsx
// Custom interactive element that needs keyboard access
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }}
>
  Custom Button
</div>

// Better: just use <button>
<button onClick={handleClick}>Custom Button</button>
```

### Roving tabIndex (Composite Widgets)

For widget groups (tabs, toolbars, menus), only one item is in the tab order at a time. Arrow keys move focus internally.

```tsx
function ToolbarButton({ isActive, ...props }: ToolbarButtonProps) {
  return (
    <button
      tabIndex={isActive ? 0 : -1}
      role="menuitem"
      {...props}
    />
  );
}
```

## Focus Management

### Visible Focus Indicators (WCAG 2.4.7)

Never remove focus outlines without providing an alternative.

```css
/* WRONG */
*:focus { outline: none; }

/* CORRECT: custom focus indicator */
:focus-visible {
  outline: 2px solid var(--color-brand-500);
  outline-offset: 2px;
}

/* Tailwind */
/* focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 */
```

Use `:focus-visible` (not `:focus`) so focus rings appear on keyboard navigation but not mouse clicks.

### Focus Trapping (Modals/Dialogs)

When a modal is open:
1. Move focus to the first focusable element inside the modal
2. Trap Tab/Shift+Tab within the modal
3. Close on Escape
4. Return focus to the trigger element on close

```tsx
"use client";

import { useEffect, useRef } from "react";

function Modal({ isOpen, onClose, children }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement;
      // Focus first focusable element
      const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      focusable?.[0]?.focus();
    } else {
      triggerRef.current?.focus(); // return focus
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" onClick={onClose} />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <h2 id="modal-title">Dialog Title</h2>
        {children}
      </div>
    </>
  );
}
```

**Libraries**: For production, use a dialog library that handles focus trapping robustly (Radix UI Dialog, Headless UI Dialog, Ariakit).

### Focus on Route Changes (SPA)

After client-side navigation, focus can be lost. Solutions:
- Move focus to the new page's `<h1>` or `<main>`
- Use `aria-live` to announce the page change
- Next.js App Router handles `<title>` announcements, but custom content announcements may still be needed

## Screen Reader Support

### Alternative Text for Images

```tsx
// Informative image: describe the content
<Image src="/chart.png" alt="Bar chart showing revenue increased 40% in Q3 2025" />

// Decorative image: empty alt
<Image src="/decorative-swirl.svg" alt="" />
// Or hide from AT entirely
<Image src="/decorative-swirl.svg" alt="" aria-hidden="true" />

// Complex image: use longer description
<figure>
  <Image src="/infographic.png" alt="Infographic about climate change" />
  <figcaption>
    Detailed description of the infographic data...
  </figcaption>
</figure>
```

### Visually Hidden Text

For screen-reader-only content. The element is visually hidden but remains in the accessibility tree.

```tsx
// Tailwind: sr-only class
<button>
  <TrashIcon aria-hidden="true" />
  <span className="sr-only">Delete item</span>
</button>

// Custom CSS equivalent
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

### Icon Buttons

Every icon-only button must have an accessible name.

```tsx
// Method 1: sr-only text
<button>
  <XMarkIcon aria-hidden="true" />
  <span className="sr-only">Close</span>
</button>

// Method 2: aria-label
<button aria-label="Close">
  <XMarkIcon aria-hidden="true" />
</button>
```

Always set `aria-hidden="true"` on decorative icons so screen readers don't announce them as "image" or read SVG data.

### Tables

```tsx
<table>
  <caption>Quarterly revenue by region</caption>  {/* describes the table */}
  <thead>
    <tr>
      <th scope="col">Region</th>
      <th scope="col">Q1</th>
      <th scope="col">Q2</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">North America</th>  {/* row header */}
      <td>$1.2M</td>
      <td>$1.4M</td>
    </tr>
  </tbody>
</table>
```

## Color Contrast

### Requirements (WCAG 1.4.3 & 1.4.11)

| Content | Minimum ratio |
|---------|--------------|
| Normal text (< 18pt / < 14pt bold) | 4.5:1 |
| Large text (>= 18pt / >= 14pt bold) | 3:1 |
| UI components & graphical objects | 3:1 |

### Checking Contrast

- Chrome DevTools: Inspect element > color picker shows ratio
- Tools: WebAIM Contrast Checker, axe DevTools, Stark (Figma)
- Automated: `axe-core`, Lighthouse accessibility audit

### Do NOT Rely on Color Alone (WCAG 1.4.1)

```tsx
// BAD: only color distinguishes error
<input className="border-red-500" />

// GOOD: color + icon + text
<div>
  <input className="border-red-500" aria-describedby="email-error" aria-invalid="true" />
  <p id="email-error" className="mt-1 flex items-center gap-1 text-sm text-red-600">
    <ExclamationIcon aria-hidden="true" />
    Please enter a valid email address
  </p>
</div>
```

## Form Accessibility

### Labels

Every form input MUST have a visible label associated via `htmlFor`/`id` or wrapping.

```tsx
// Method 1: htmlFor / id pairing
<label htmlFor="email">Email address</label>
<input id="email" type="email" name="email" />

// Method 2: wrapping (implicit association)
<label>
  Email address
  <input type="email" name="email" />
</label>
```

**Do NOT use `placeholder` as the only label.** Placeholders disappear on input and have insufficient contrast.

### Error Messages

```tsx
<div>
  <label htmlFor="password">Password</label>
  <input
    id="password"
    type="password"
    aria-describedby="password-hint password-error"
    aria-invalid={!!error}
    aria-required="true"
  />
  <p id="password-hint" className="text-sm text-gray-500">
    Must be at least 8 characters
  </p>
  {error && (
    <p id="password-error" role="alert" className="text-sm text-red-600">
      {error}
    </p>
  )}
</div>
```

### Fieldsets and Legends

Group related inputs (radio groups, checkbox groups, address fields):

```tsx
<fieldset>
  <legend>Notification preferences</legend>
  <label>
    <input type="checkbox" name="email_notifs" /> Email notifications
  </label>
  <label>
    <input type="checkbox" name="sms_notifs" /> SMS notifications
  </label>
</fieldset>
```

### Required Fields

```tsx
// Indicate required visually AND programmatically
<label htmlFor="name">
  Full name <span aria-hidden="true" className="text-red-500">*</span>
</label>
<input id="name" required aria-required="true" />
```

### Autocomplete

Use the `autocomplete` attribute to help users fill forms:

```tsx
<input type="text" name="name" autoComplete="name" />
<input type="email" name="email" autoComplete="email" />
<input type="tel" name="phone" autoComplete="tel" />
<input type="text" name="address" autoComplete="street-address" />
<input type="text" name="city" autoComplete="address-level2" />
<input type="text" name="zip" autoComplete="postal-code" />
```

## Skip Links

Provide a skip link as the first focusable element on the page. It lets keyboard users jump past repetitive navigation.

```tsx
// Usually in the root layout
<body>
  <a
    href="#main-content"
    className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:shadow-lg"
  >
    Skip to main content
  </a>
  <header>...</header>
  <nav>...</nav>
  <main id="main-content" tabIndex={-1}>
    {/* tabIndex={-1} ensures focus moves here when the link is activated */}
    {children}
  </main>
</body>
```

For complex pages, offer multiple skip links:

```tsx
<ul className="sr-only focus-within:not-sr-only">
  <li><a href="#main-content">Skip to main content</a></li>
  <li><a href="#search">Skip to search</a></li>
  <li><a href="#footer-nav">Skip to footer navigation</a></li>
</ul>
```

## Live Regions

Live regions announce dynamic content changes to screen readers.

### `aria-live`

```tsx
// Polite: announced at the next idle moment (most common)
<div aria-live="polite" aria-atomic="true">
  {statusMessage}
</div>

// Assertive: interrupts current speech (use for urgent alerts)
<div aria-live="assertive">
  {errorMessage}
</div>
```

**Critical**: The live region container must exist in the DOM BEFORE the content changes. Do NOT conditionally render the container.

```tsx
// WRONG: screen reader may not detect this
{error && <div role="alert">{error}</div>}

// CORRECT: container always present, content changes
<div role="alert" aria-live="assertive">
  {error ?? ""}
</div>
```

### Common Live Region Patterns

**Toast notifications**:
```tsx
// Region exists in layout, always mounted
<div aria-live="polite" className="sr-only" id="toast-announcer">
  {toastMessage}
</div>
// Visual toast is separate and can animate in/out
```

**Loading states**:
```tsx
<div aria-live="polite" aria-busy={isLoading}>
  {isLoading ? "Loading results..." : `${results.length} results found`}
</div>
```

**Search results count**:
```tsx
<div role="status" aria-live="polite">
  {query && `${count} results for "${query}"`}
</div>
```

### Implicit Live Region Roles

| Role | Equivalent | Use |
|------|-----------|-----|
| `role="alert"` | `aria-live="assertive"` | Errors, urgent messages |
| `role="status"` | `aria-live="polite"` | Status updates |
| `role="log"` | `aria-live="polite"` | Chat, activity logs |
| `role="timer"` | `aria-live="off"` | Countdowns (do NOT auto-announce) |

## Testing Checklist

### Manual Checks

- [ ] Tab through the entire page: logical order, no traps, all interactive elements reachable
- [ ] Activate all controls with keyboard only (Enter, Space, Escape, Arrow keys)
- [ ] Test with screen reader (VoiceOver on macOS: Cmd+F5, NVDA on Windows)
- [ ] Zoom to 200%: no content loss, no horizontal scrolling
- [ ] Check with browser color contrast tools
- [ ] Disable CSS: content order should still make sense
- [ ] Test with `prefers-reduced-motion: reduce` enabled

### Automated Tools

- **axe DevTools** (browser extension): Catches ~30-40% of issues
- **Lighthouse** (built into Chrome): Basic audit
- **eslint-plugin-jsx-a11y**: Catches issues at lint time
- **Pa11y** or **axe-core**: CI integration

```json
// .eslintrc.json
{
  "extends": ["plugin:jsx-a11y/recommended"]
}
```

### Screen Reader Testing Commands (macOS VoiceOver)

| Action | Keys |
|--------|------|
| Toggle VoiceOver | Cmd + F5 |
| Navigate next element | VO + Right Arrow (VO = Ctrl + Option) |
| Navigate headings | VO + Cmd + H |
| Navigate landmarks | VO + Cmd + L |
| Read all | VO + A |
| Open rotor | VO + U |

## Quick Reference: WCAG 2.1 AA Checklist

| Criterion | Key requirement |
|-----------|----------------|
| 1.1.1 | Non-text content has text alternative |
| 1.3.1 | Info and relationships conveyed in structure |
| 1.3.2 | Meaningful reading sequence |
| 1.3.4 | Content not restricted to single orientation |
| 1.3.5 | Input purpose identifiable (autocomplete) |
| 1.4.1 | Color is not the only visual means of conveying info |
| 1.4.3 | Text contrast at least 4.5:1 |
| 1.4.4 | Text resizable to 200% without loss |
| 1.4.11 | Non-text contrast at least 3:1 |
| 1.4.12 | Text spacing adjustable without loss |
| 2.1.1 | All functionality keyboard accessible |
| 2.1.2 | No keyboard traps |
| 2.4.1 | Skip navigation mechanism |
| 2.4.2 | Pages have descriptive titles |
| 2.4.3 | Focus order is logical |
| 2.4.6 | Headings and labels are descriptive |
| 2.4.7 | Focus indicator is visible |
| 2.5.1 | Pointer gestures have single-pointer alternatives |
| 2.5.3 | Accessible name matches visible label |
| 3.1.1 | Page language is identified (`<html lang="en">`) |
| 3.2.1 | No change of context on focus |
| 3.2.2 | No change of context on input (without warning) |
| 3.3.1 | Errors are identified and described in text |
| 3.3.2 | Instructions provided for user input |
| 4.1.2 | All UI components have name, role, value |
| 4.1.3 | Status messages use roles or live regions |
