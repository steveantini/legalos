# Responsive Design

| Field | Value |
|---|---|
| **Version** | 1.0.0 |
| **Last Updated** | 2026-03-06 |
| **Applicability** | Web applications targeting mobile, tablet, and desktop devices |
| **Dependencies** | Tailwind CSS (or equivalent responsive utility framework), modern browser support |

---

## Mobile-First Approach

### Principle

Write base styles for the smallest screen, then add complexity at wider breakpoints. Mobile is the default; desktop is the enhancement.

```css
/* Base: mobile (no media query) */
.card { padding: 1rem; }

/* Tablet and up */
@media (min-width: 768px) {
  .card { padding: 1.5rem; }
}

/* Desktop and up */
@media (min-width: 1024px) {
  .card { padding: 2rem; }
}
```

### Tailwind Mobile-First

```html
<!-- Base = mobile. Prefix = that breakpoint and up. -->
<div class="p-4 md:p-6 lg:p-8">
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
<div class="text-sm md:text-base">
```

### Design Order

1. Design and build mobile layout first.
2. Test on a real device or Chrome DevTools (375px width).
3. Expand viewport — identify where layout breaks or wastes space.
4. Add breakpoint adjustments at those natural break points.
5. Test at every breakpoint boundary, not just one width per tier.

---

## Breakpoint Strategy

### Standard Breakpoints

| Name | Min-width | Target | Tailwind Prefix |
|---|---|---|---|
| Mobile | 0px | Phones portrait | (default) |
| Mobile landscape | 480px | Phones landscape | `xs:` (custom) |
| Tablet | 768px | Tablets portrait, small laptops | `md:` |
| Desktop | 1024px | Laptops, desktops | `lg:` |
| Wide | 1280px | Large monitors | `xl:` |
| Ultra-wide | 1536px | Ultra-wide monitors | `2xl:` |

### Tailwind Config (if adding custom breakpoint)

```javascript
// tailwind.config.ts
export default {
  theme: {
    screens: {
      xs: '480px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
  },
};
```

### Content-Based Breakpoints

Prefer breakpoints where the design breaks, not at device sizes:

- If a two-column layout cramps below 700px, break at 700px.
- If navigation items overflow below 900px, break at 900px.
- Named breakpoints (sm, md, lg) are starting points, not rules.

### Container Queries

For component-level responsiveness (independent of viewport):

```css
.card-container {
  container-type: inline-size;
}

@container (min-width: 400px) {
  .card { flex-direction: row; }
}
```

Tailwind syntax:

```html
<div class="@container">
  <div class="flex flex-col @md:flex-row">
```

---

## Touch Targets

### Minimum Sizes

| Standard | Minimum Size | Recommended |
|---|---|---|
| WCAG 2.2 AAA | 44x44px | 48x48px |
| Apple HIG | 44x44pt | 44x44pt |
| Material Design | 48x48dp | 48x48dp |

### Implementation

```html
<!-- Visible element small, touch target large -->
<button class="p-3 -m-3">
  <!-- Icon is 16px, but tap area is 40px+ -->
  <Icon className="h-4 w-4" />
</button>

<!-- Or use min-height/min-width -->
<button class="min-h-[44px] min-w-[44px] flex items-center justify-center">
```

### Touch Target Rules

- **Spacing**: Minimum 8px between adjacent touch targets.
- **Edge targets**: Place critical actions away from screen edges (safe area inset).
- **Thumb zone**: On mobile, primary actions in the bottom 60% of the screen.
- **No hover-only interactions**: Everything accessible via hover must also work with tap.
- **No double-tap**: Never require double-tap; it conflicts with zoom.

---

## Viewport Considerations

### Viewport Meta Tag

```html
<meta name="viewport" content="width=device-width, initial-scale=1" />
```

Never use `maximum-scale=1` or `user-scalable=no` — they break accessibility (prevents pinch-to-zoom).

### Safe Area Insets (Notch, Dynamic Island)

```css
/* For devices with notches/rounded corners */
body {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}

/* Tailwind utility (if configured) */
<div class="pb-[env(safe-area-inset-bottom)]">
```

### Viewport Height Issues

Mobile browsers have dynamic toolbars that change viewport height.

```css
/* Use dvh (dynamic viewport height) instead of vh */
.full-screen {
  height: 100dvh;  /* adjusts as toolbar shows/hides */
}

/* Fallback for older browsers */
.full-screen {
  height: 100vh;
  height: 100dvh;
}
```

### Orientation

```css
@media (orientation: portrait) { /* phone held upright */ }
@media (orientation: landscape) { /* phone sideways, or desktop */ }
```

Avoid locking orientation. If layout dramatically changes, use orientation media queries to adjust.

---

## Responsive Images

### `next/image` (Recommended for Next.js)

```tsx
import Image from 'next/image';

// Fixed size
<Image src="/photo.jpg" width={800} height={600} alt="Description" />

// Fill container
<div className="relative aspect-video">
  <Image src="/photo.jpg" fill className="object-cover" alt="Description" />
</div>

// Responsive with sizes hint
<Image
  src="/hero.jpg"
  width={1200}
  height={630}
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
  alt="Hero"
/>
```

### Native HTML Responsive Images

```html
<!-- Different crops for different screens -->
<picture>
  <source media="(min-width: 1024px)" srcset="/hero-wide.webp" />
  <source media="(min-width: 768px)" srcset="/hero-medium.webp" />
  <img src="/hero-mobile.webp" alt="Hero" />
</picture>

<!-- Same image, different resolutions -->
<img
  src="/photo-400.jpg"
  srcset="/photo-400.jpg 400w, /photo-800.jpg 800w, /photo-1200.jpg 1200w"
  sizes="(max-width: 768px) 100vw, 50vw"
  alt="Photo"
/>
```

### Image Guidelines

- **Format**: WebP for photos, SVG for icons/illustrations, AVIF where supported.
- **Lazy loading**: Default for below-fold images (`loading="lazy"`). Eager for LCP image.
- **Aspect ratio**: Set explicit `width`/`height` or use `aspect-ratio` to prevent layout shift.
- **Placeholder**: Use `blurDataURL` (Next.js) or CSS background for loading state.
- **Max size**: Serve max 2x display resolution. A 400px container needs max 800px image.

---

## Navigation Patterns

### Mobile Navigation

| Pattern | When to Use | Pros | Cons |
|---|---|---|---|
| Bottom tab bar | 3-5 primary destinations | Thumb-friendly, always visible | Limited items |
| Hamburger menu | Many items, secondary nav | Saves space | Hidden, low discoverability |
| Full-screen overlay | Complex nav with sections | Clear hierarchy | Disruptive |
| Slide-out drawer | Dashboard sidebar on mobile | Familiar pattern | May conflict with swipe gestures |

### Desktop Navigation

| Pattern | When to Use |
|---|---|
| Top nav bar | Marketing sites, simple apps |
| Sidebar | Dashboards, admin panels, documentation |
| Top nav + sidebar | Complex apps (top = global, side = section) |

### Responsive Navigation Implementation

```tsx
// Sidebar that collapses to hamburger on mobile
<>
  {/* Desktop sidebar */}
  <aside className="hidden lg:flex lg:w-64 lg:flex-col border-r">
    <Nav />
  </aside>

  {/* Mobile hamburger + sheet */}
  <div className="lg:hidden">
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left">
        <Nav />
      </SheetContent>
    </Sheet>
  </div>
</>
```

### Bottom Navigation Bar (Mobile)

```tsx
<nav className="fixed bottom-0 inset-x-0 bg-background border-t
                flex justify-around items-center h-16
                pb-[env(safe-area-inset-bottom)]
                lg:hidden">
  <NavItem icon={Home} label="Home" href="/" />
  <NavItem icon={Search} label="Search" href="/search" />
  <NavItem icon={Bell} label="Alerts" href="/alerts" />
  <NavItem icon={User} label="Profile" href="/profile" />
</nav>

{/* Add bottom padding to main content to prevent overlap */}
<main className="pb-20 lg:pb-0">
```

---

## Device Testing

### Testing Matrix

| Priority | Devices | Why |
|---|---|---|
| **P0** | iPhone 14/15 (Safari), Samsung Galaxy S23 (Chrome) | Most common mobile devices |
| **P0** | Chrome Desktop (Windows), Safari Desktop (Mac) | Most common desktop browsers |
| **P1** | iPad (Safari) | Most common tablet |
| **P1** | Firefox Desktop | Third browser |
| **P2** | Older iPhones (SE, 12), budget Androids | Smaller screens, slower hardware |

### Testing Approach

1. **Chrome DevTools**: First pass at all breakpoints. Use device toolbar.
2. **Real devices**: Test touch interactions, scroll behavior, keyboard behavior.
3. **BrowserStack / Sauce Labs**: Cross-browser coverage without physical devices.
4. **Lighthouse**: Performance audit per viewport (mobile throttled).

### What to Test per Breakpoint

- [ ] Layout does not overflow horizontally (no horizontal scroll).
- [ ] Text is readable without zooming (min 16px body text on mobile).
- [ ] Touch targets are minimum 44x44px with adequate spacing.
- [ ] Forms are usable (inputs not obscured by keyboard).
- [ ] Navigation is accessible (can reach all pages).
- [ ] Images are sharp (not blurry from under-sizing).
- [ ] Modals/dialogs are fully visible and scrollable.
- [ ] Fixed/sticky elements do not overlap content.
- [ ] Landscape orientation does not break layout.

---

## PWA Considerations

### When to Consider PWA

- App is frequently revisited by the same users.
- Core features work with intermittent connectivity.
- Push notifications add value (not just marketing).
- "Add to home screen" improves engagement.

### Minimum PWA Setup

```json
// public/manifest.json
{
  "name": "App Name",
  "short_name": "App",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#000000",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

```html
<!-- In <head> -->
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#000000" />
<link rel="apple-touch-icon" href="/icon-192.png" />
```

### Service Worker (Caching Strategy)

| Strategy | When |
|---|---|
| Cache First | Static assets (CSS, JS, images) |
| Network First | API responses, dynamic content |
| Stale While Revalidate | Content that updates but staleness is acceptable |

### Offline Support Levels

| Level | Effort | User Experience |
|---|---|---|
| **Offline page** | Low | Show friendly "you're offline" page |
| **Read-only cache** | Medium | Previously viewed content available offline |
| **Full offline** | High | Queue mutations, sync when online |

### PWA Checklist

- [ ] `manifest.json` with icons, name, start URL, display mode
- [ ] Service worker registered (use `next-pwa` or Workbox)
- [ ] Offline fallback page
- [ ] `theme-color` meta tag
- [ ] Apple touch icon
- [ ] Lighthouse PWA audit passes
- [ ] Install prompt handling (custom or browser default)

---

## Responsive Patterns Quick Reference

| Pattern | Mobile | Tablet | Desktop |
|---|---|---|---|
| Navigation | Hamburger or bottom tabs | Sidebar or top nav | Full sidebar |
| Data table | Card list or horizontal scroll | Compact table | Full table |
| Form layout | Single column, full width | Single column, constrained | Two column or card |
| Dashboard grid | Stacked cards | 2-column grid | 3-4 column grid |
| Modal | Full screen (sheet) | Centered dialog | Centered dialog |
| Sidebar content | Hidden (drawer) | Collapsed (icons only) | Full sidebar |
| Image gallery | Single column | 2-column | 3-4 column masonry |
