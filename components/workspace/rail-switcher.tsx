"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Client-side switch between the three workspace rails based on pathname.
 * All three rails are rendered server-side and passed as props; this
 * component decides which to mount. The modes are mutually exclusive
 * sibling prefixes:
 *
 *   - `/workspace/admin/*`    → admin rail
 *   - `/workspace/settings/*` → settings rail
 *   - everything else         → workspace rail
 *
 * Admin and settings are sibling prefixes, so check order doesn't affect
 * correctness; admin is checked first to match the existing pattern.
 *
 * Rendering all rails on the server and choosing client-side lets the
 * decision live at the client boundary (where `usePathname` lives)
 * without making any rail itself a client component.
 */
export function RailSwitcher({
  workspaceRail,
  adminRail,
  settingsRail,
}: {
  workspaceRail: ReactNode;
  adminRail: ReactNode;
  settingsRail: ReactNode;
}) {
  const pathname = usePathname();
  if (pathname.startsWith("/workspace/admin")) return <>{adminRail}</>;
  if (pathname.startsWith("/workspace/settings")) return <>{settingsRail}</>;
  return <>{workspaceRail}</>;
}
