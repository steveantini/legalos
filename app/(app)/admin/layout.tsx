import { requireAdminUser } from "@/lib/auth/access";

/**
 * Admin-only layout. Gates every admin sub-route via `requireAdminUser()`
 * — non-admin users see a 404 rather than a redirect so the admin
 * section's existence is not leaked. Provides a common max-width
 * container so sub-pages can focus on content.
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
