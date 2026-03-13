# Tailwind CSS Conventions & Patterns

---
version: 1.0.0
last_updated: 2026-03-06
applicability: Tailwind CSS v3.4+ and v4, PostCSS or Vite
dependencies: Tailwind CSS 3.4+ or 4.x, PostCSS (v3) or Vite (v4)
---

## Utility Class Ordering

Follow a consistent ordering convention for readability. Recommended order (outer to inner, layout to detail):

```
1. Layout/Position   — block, flex, grid, absolute, relative, sticky, z-*
2. Display/Overflow  — hidden, overflow-*, inline-flex
3. Box Model         — w-*, h-*, min-*, max-*, p-*, m-*
4. Flexbox/Grid      — flex-*, items-*, justify-*, gap-*, grid-cols-*
5. Typography        — text-*, font-*, leading-*, tracking-*, truncate
6. Backgrounds       — bg-*, from-*, to-*, via-*
7. Borders           — border-*, rounded-*, ring-*
8. Effects/Filters   — shadow-*, opacity-*, blur-*, backdrop-*
9. Transitions       — transition-*, duration-*, ease-*
10. Transforms       — scale-*, rotate-*, translate-*
11. Interactivity    — cursor-*, select-*, pointer-events-*
12. State variants   — hover:, focus:, active:, disabled:, group-hover:
13. Responsive       — sm:, md:, lg:, xl:, 2xl:
14. Dark mode        — dark:
```

**Tooling**: Use the `prettier-plugin-tailwindcss` Prettier plugin to auto-sort classes. This is the authoritative source for ordering and eliminates manual decisions.

```json
// .prettierrc
{
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

## Responsive Design

### Mobile-First Breakpoints

Tailwind is mobile-first. Base styles apply to all sizes. Breakpoints apply at that width **and above**.

| Prefix | Min-width | Typical target |
|--------|-----------|---------------|
| (none) | 0px | Mobile (default) |
| `sm:` | 640px | Large phones / small tablets |
| `md:` | 768px | Tablets |
| `lg:` | 1024px | Small laptops |
| `xl:` | 1280px | Desktops |
| `2xl:` | 1536px | Large desktops |

```tsx
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
  {/* 1 col mobile, 2 col tablet, 3 col laptop, 4 col desktop */}
</div>
```

**Container pattern**:

```tsx
<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
  {/* Centered content with responsive padding */}
</div>
```

### Custom Breakpoints

**Tailwind v3** (`tailwind.config.js`):
```js
module.exports = {
  theme: {
    screens: {
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
      "3xl": "1920px", // custom addition
    },
  },
};
```

**Tailwind v4** (`@theme` in CSS):
```css
@import "tailwindcss";

@theme {
  --breakpoint-3xl: 1920px;
}
```

## Dark Mode

### Configuration

**Tailwind v3**: Set `darkMode: "class"` in config (recommended for manual control).

**Tailwind v4**: Class-based dark mode is the default. No config needed.

### Implementation

```tsx
<div className="bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
  <h1 className="text-gray-800 dark:text-gray-200">Title</h1>
  <p className="text-gray-600 dark:text-gray-400">Body text</p>
</div>
```

### Theme Toggle (Next.js)

Use `next-themes` for dark mode toggling with SSR support:

```tsx
// app/layout.tsx
import { ThemeProvider } from "next-themes";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

### Design Token Approach

Define semantic colors that switch automatically:

**Tailwind v3**:
```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        surface: "var(--color-surface)",
        "on-surface": "var(--color-on-surface)",
      },
    },
  },
};
```

```css
:root {
  --color-surface: theme("colors.white");
  --color-on-surface: theme("colors.gray.900");
}
.dark {
  --color-surface: theme("colors.gray.950");
  --color-on-surface: theme("colors.gray.100");
}
```

**Tailwind v4**:
```css
@import "tailwindcss";

@theme {
  --color-surface: var(--surface);
  --color-on-surface: var(--on-surface);
}

:root {
  --surface: oklch(1 0 0);        /* white */
  --on-surface: oklch(0.15 0 0);  /* near-black */
}
.dark {
  --surface: oklch(0.15 0 0);
  --on-surface: oklch(0.95 0 0);
}
```

## Custom Theme Extension

### Tailwind v3 (`tailwind.config.js`)

```js
const defaultTheme = require("tailwindcss/defaultTheme");

module.exports = {
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", ...defaultTheme.fontFamily.sans],
        mono: ["var(--font-roboto-mono)", ...defaultTheme.fontFamily.mono],
      },
      colors: {
        brand: {
          50: "#f0f9ff",
          100: "#e0f2fe",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          900: "#0c4a6e",
        },
      },
      spacing: {
        18: "4.5rem",
        88: "22rem",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
};
```

### Tailwind v4 (`@theme` in CSS)

```css
@import "tailwindcss";

@theme {
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-roboto-mono), ui-monospace, monospace;

  --color-brand-50: oklch(0.97 0.02 220);
  --color-brand-500: oklch(0.65 0.18 220);
  --color-brand-600: oklch(0.55 0.18 220);
  --color-brand-700: oklch(0.45 0.16 220);

  --animate-fade-in: fade-in 0.3s ease-out;
  --animate-slide-up: slide-up 0.3s ease-out;

  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slide-up {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
}
```

## Component-Level Organization

### Extracting Component Classes with `@apply` (Use Sparingly)

```css
/* Only for highly repeated patterns that cannot be a React component */
@layer components {
  .btn-primary {
    @apply inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-50;
  }
}
```

**Prefer React components over `@apply`**. The primary abstraction in a React project is the component, not CSS classes.

### Component Pattern (Preferred)

```tsx
import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // base styles
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700 focus-visible:outline-brand-600",
        secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100",
        ghost: "hover:bg-gray-100 dark:hover:bg-gray-800",
        destructive: "bg-red-600 text-white hover:bg-red-700",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
```

### The `cn` Utility

Combines `clsx` and `tailwind-merge` for conditional class merging without conflicts:

```tsx
// lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Usage:
```tsx
cn("px-4 py-2", isActive && "bg-blue-500", className)
// If className contains "px-6", tailwind-merge resolves the conflict correctly
```

## Animation Patterns

### Transition Utilities

```tsx
{/* Hover transition */}
<button className="transition-colors duration-200 hover:bg-gray-100">
  Click me
</button>

{/* Transform on hover */}
<div className="transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg">
  Card
</div>

{/* Multiple properties */}
<div className="transition-[color,background-color,transform] duration-200">
  Multi
</div>
```

### Keyframe Animations

```tsx
{/* Built-in */}
<div className="animate-spin">Loading</div>
<div className="animate-pulse">Skeleton</div>
<div className="animate-bounce">Bounce</div>

{/* Custom (defined in theme) */}
<div className="animate-fade-in">Fading in</div>

{/* Conditional animation */}
<div className={cn("transition-all duration-300", isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2")}>
  Conditional
</div>
```

### Staggered Animations

```tsx
{items.map((item, i) => (
  <div
    key={item.id}
    className="animate-fade-in"
    style={{ animationDelay: `${i * 75}ms`, animationFillMode: "backwards" }}
  >
    {item.name}
  </div>
))}
```

### Reduced Motion

Always respect user preferences:

```tsx
<div className="animate-bounce motion-reduce:animate-none">
  Bouncing (unless reduced motion preferred)
</div>

<div className="transition-transform duration-300 hover:-translate-y-1 motion-reduce:transform-none motion-reduce:transition-none">
  Respectful hover
</div>
```

## Anti-Patterns to Avoid

### Do NOT use arbitrary values as a design system escape hatch

```tsx
// BAD: defeats the purpose of a design system
<div className="mt-[13px] w-[347px] text-[15px]">

// GOOD: use the scale or extend the theme
<div className="mt-3 w-88 text-sm">
```

Arbitrary values (`[...]`) are acceptable for one-off values that genuinely don't fit the scale (e.g., matching an external design spec). If you use the same arbitrary value twice, add it to the theme.

### Do NOT construct class names dynamically

```tsx
// BAD: Tailwind cannot detect these at build time
const color = "red";
<div className={`bg-${color}-500`}>

// GOOD: use complete class names
const colorClasses = {
  red: "bg-red-500",
  blue: "bg-blue-500",
} as const;
<div className={colorClasses[color]}>
```

### Do NOT fight the utility model

```tsx
// BAD: mixing CSS and Tailwind defeats the tooling
.custom-card {
  @apply p-4;
  border: 1px solid #e5e7eb; /* mixing raw CSS with @apply */
}

// GOOD: either all utilities or all custom CSS
<div className="rounded-lg border border-gray-200 p-4 shadow-sm">
```

### Do NOT over-nest with `@apply`

```css
/* BAD: recreating CSS-in-JS with extra steps */
.card { @apply p-4 rounded-lg shadow; }
.card-header { @apply mb-4 border-b pb-2; }
.card-title { @apply text-lg font-semibold; }
.card-body { @apply text-gray-600; }

/* GOOD: use a React component with inline utilities */
```

### Do NOT use `!important` utilities unless absolutely necessary

```tsx
// BAD: indicates a specificity problem
<div className="!mt-0">

// GOOD: fix the root cause or use cn() for proper merging
```

## Tailwind v3 vs. v4 Key Differences

| Feature | v3 | v4 |
|---------|----|----|
| Config | `tailwind.config.js` | CSS `@theme` directive |
| Engine | PostCSS plugin | Native Rust engine (Oxide) |
| Import | `@tailwind base/components/utilities` | `@import "tailwindcss"` |
| Dark mode | `darkMode: "class"` in config | Class strategy is default |
| Content paths | `content: [...]` in config | Automatic detection |
| Custom colors | `theme.extend.colors` in JS | `--color-*` in `@theme` |
| Container queries | Plugin required | Built-in (`@container`, `@sm:`, `@md:`) |
| Color format | Hex/RGB | OKLCH recommended |

## Content Configuration (v3 only)

```js
// tailwind.config.js
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    // Include component library paths
    "./node_modules/@your-org/ui/**/*.{js,ts,jsx,tsx}",
  ],
};
```

Tailwind v4 auto-detects content sources. Manual configuration is only needed for files outside the project root.
