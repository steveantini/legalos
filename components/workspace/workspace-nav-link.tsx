"use client";

import Link, { type LinkProps } from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import {
  type AgentsLookup,
  isLeafActive,
  type RailLeafMatch,
} from "@/lib/workspace/rail-active";

/**
 * Client wrapper around `<Link>` that applies an active class based on
 * the current pathname. Used by the workspace and admin rails so the
 * same `<Link>` can render with a "default" or "active" treatment
 * depending on the current route — without making the entire rail a
 * client component.
 *
 * Active resolution is delegated to `isLeafActive` in
 * `lib/workspace/rail-active.ts` — one source of truth shared with
 * `<CollapsibleRailGroup>` so the group's force-expand-when-active
 * logic can never diverge from the link's own active-state logic.
 *
 * Two match modes:
 *
 * - `match="exact"` — applies active when `pathname === href`. Used for
 *   the Workspace link (`/workspace`) and resource-group leaves. The
 *   exact mode keeps `/workspace` from prefix-matching every nested
 *   workspace route.
 *
 * - `match="prefix"` — applies active when `pathname === href` OR
 *   `pathname.startsWith(href + "/")`. Used for the Departments group
 *   so `/workspace/departments/commercial` activates Commercial, and
 *   any future nested routes under a department keep the parent
 *   active.
 *
 * Optional `agentsLookup` extends prefix-mode active resolution: when
 * the pathname is `/workspace/agents/<id>` AND this link is a
 * department link (`href` starts with `/workspace/departments/`), the
 * agent is looked up in the map and the link is active if the agent's
 * department matches this link's slug. Lets the rail's parent-
 * department highlight follow navigation into the chat surface.
 */
export function WorkspaceNavLink({
  href,
  match = "exact",
  className,
  activeClassName,
  children,
  agentsLookup,
  ...rest
}: {
  href: string;
  match?: RailLeafMatch;
  className: string;
  activeClassName: string;
  children: ReactNode;
  agentsLookup?: AgentsLookup;
} & Omit<LinkProps, "href">) {
  const pathname = usePathname();
  const isActive = isLeafActive(pathname, href, match, agentsLookup);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={isActive ? activeClassName : className}
      {...rest}
    >
      {children}
    </Link>
  );
}
