import { requireAdminUser } from "@/lib/auth/access";
import { SECTION_CONTENT_MAX_WIDTH } from "@/lib/workspace/layout";

/**
 * Admin-only layout. Gates every admin sub-route via `requireAdminUser()`
 * — non-admin users see a 404 rather than a redirect so the admin
 * section's existence is not leaked.
 *
 * Width reconciled to the section family's `SECTION_CONTENT_MAX_WIDTH`
 * (896px) in the Admin polish arc (D-074), down from the legacy
 * `max-w-5xl` (1024px): admin is now a peer of settings and shares one
 * reading width with it. The older admin pages (calculator, metrics,
 * users) render comfortably at 896px until their per-area replacements
 * ship in A2–A5.
 *
 * Unlike the settings layout, this one owns the `<main>` for the whole
 * section, so admin pages render as fragments inside it (the four
 * coming-soon area stubs use `AdminComingSoon`, which renders no main of
 * its own to avoid nesting landmarks).
 *
 * Inherits the rail + top bar from `(workspace)/layout.tsx`; the rail
 * profile dropdown's "Admin" item is the navigation entry here.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminUser();

  return (
    <main className={`mx-auto ${SECTION_CONTENT_MAX_WIDTH}`}>{children}</main>
  );
}
