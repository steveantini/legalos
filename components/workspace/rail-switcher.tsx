"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Client-side switch between `WorkspaceRail` and `AdminRail` based on
 * pathname. Both rails are rendered server-side and passed as props;
 * this component decides which to mount. Admin mode = pathname starts
 * with `/workspace/admin`.
 *
 * Rendering both rails on the server and choosing client-side lets the
 * decision live at the client boundary (where `usePathname` lives)
 * without making either rail itself a client component.
 */
export function RailSwitcher({
  workspaceRail,
  adminRail,
}: {
  workspaceRail: ReactNode;
  adminRail: ReactNode;
}) {
  const pathname = usePathname();
  const isAdminMode = pathname.startsWith("/workspace/admin");
  return <>{isAdminMode ? adminRail : workspaceRail}</>;
}
