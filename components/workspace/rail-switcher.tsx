"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { getCurrentMode } from "@/lib/workspace/modes";

/**
 * Client-side switch between the three workspace rails based on pathname.
 * All three rails are rendered server-side and passed as props; this
 * component decides which to mount.
 *
 * The current mode comes from the shared `getCurrentMode` (lib/workspace/
 * modes.ts) — the same source the profile menu uses — so the rail shown and
 * the mode the menu marks current cannot drift. `getCurrentMode` owns the
 * precedence (platform, then admin, then settings, then workspace as the
 * default, since `/workspace` prefixes every mode).
 *
 * Rendering all rails on the server and choosing client-side lets the
 * decision live at the client boundary (where `usePathname` lives)
 * without making any rail itself a client component.
 */
export function RailSwitcher({
  workspaceRail,
  adminRail,
  settingsRail,
  platformRail,
}: {
  workspaceRail: ReactNode;
  adminRail: ReactNode;
  settingsRail: ReactNode;
  platformRail: ReactNode;
}) {
  const mode = getCurrentMode(usePathname());
  if (mode === "platform") return <>{platformRail}</>;
  if (mode === "admin") return <>{adminRail}</>;
  if (mode === "settings") return <>{settingsRail}</>;
  return <>{workspaceRail}</>;
}
