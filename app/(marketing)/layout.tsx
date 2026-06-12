import { SupportLauncher } from "@/components/support/support-launcher";

/**
 * Shared segment for the public marketing surface: the landing plus
 * the marketing pages (D-128). The segment shares one navigation
 * boundary (see template.tsx for the per-navigation enter transition).
 *
 * The support assistant's launcher (D-161) mounts here and ONLY here:
 * every public marketing page gets the quiet corner icon, and the
 * workspace structurally cannot (it lives in a different segment). The
 * launcher is a client island that gates itself via GET /api/support,
 * so the pages stay static and the landing choreography is untouched.
 * Layouts persist across navigations, so a conversation survives moving
 * between marketing pages within a visit.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <SupportLauncher />
    </>
  );
}
