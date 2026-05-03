import { requireAdminUser } from "@/lib/auth/access";

/**
 * Admin-only layout. Gates every admin sub-route via `requireAdminUser()`
 * — non-admin users see a 404 rather than a redirect so the admin
 * section's existence is not leaked. Provides a wider max-width
 * container (`max-w-5xl` vs the agent surfaces' `max-w-3xl`) since the
 * metrics tables benefit from the extra width.
 *
 * Inherits the workspace rail + top bar from `(workspace)/layout.tsx`
 * (Session 14 moved admin out of the legacy `(app)` group). The rail
 * profile dropdown's "Admin" item is the navigation entry here.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminUser();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
  );
}
