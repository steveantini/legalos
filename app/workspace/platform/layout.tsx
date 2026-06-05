import { requirePlatformOwner } from "@/lib/auth/access";
import { SECTION_CONTENT_MAX_WIDTH } from "@/lib/workspace/layout";

/**
 * Platform-admin layout — the cross-tenant platform-owner surface for
 * legalOS-the-vendor (C4L/platform arc, Step 1). Gates every platform sub-route
 * via `requirePlatformOwner()`: a non-platform-owner — INCLUDING an org
 * super_admin — gets a 404 rather than a redirect, so the surface's existence is
 * not leaked. Being a mere super_admin does not grant access; platform_owner is
 * required (a separate cross-tenant axis, not a higher org role).
 *
 * Mirrors the org admin layout one tier up: same `SECTION_CONTENT_MAX_WIDTH`
 * (the section family width), same left-anchored `<main>`, same fragment-inside
 * idiom. Inherits the rail + top bar from `app/workspace/layout.tsx`; the rail's
 * platform rail and the profile dropdown's "Platform" item are the navigation
 * entries here (both shown only to a platform owner).
 */
export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePlatformOwner();

  return (
    <main className={`w-full ${SECTION_CONTENT_MAX_WIDTH}`}>{children}</main>
  );
}
