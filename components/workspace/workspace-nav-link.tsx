"use client";

import Link, { type LinkProps } from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import type { AgentBreadcrumbContext } from "@/lib/auth/access";

/**
 * Client wrapper around `<Link>` that applies an active class based on
 * the current pathname. Used by the workspace rail so the same `<Link>`
 * can render with a "default" or "active" treatment depending on the
 * current route — without making the entire rail a client component.
 *
 * Two match modes:
 *
 * - `match="exact"` — applies active when `pathname === href`. Used for
 *   the Workspace link (`/`) and the Resource links (`/coming-soon/<slug>`).
 *   `/` exact-matches only on the workspace landing — without `exact`, every
 *   path under the workspace group would match `pathname.startsWith("/")`.
 *
 * - `match="prefix"` — applies active when `pathname === href` OR
 *   `pathname.startsWith(href + "/")`. Used for the Departments group so
 *   `/departments/commercial` activates the Commercial entry, AND any
 *   future nested routes like `/departments/commercial/agents/<id>`
 *   (if the department launchpad ever gains sub-routes) keep the parent
 *   active.
 *
 * Optional `agentsLookup` extends prefix-mode active resolution: when
 * the pathname is `/agents/<id>` (or `/agents/<id>/edit`) AND this link
 * is a department link (`href` starts with `/departments/`), the agent
 * is looked up in the list and the link is active if the agent's
 * `department_slug` matches this link's slug. Lets the rail's parent-
 * department highlight follow navigation into a chat surface, even
 * though chat URLs aren't structurally nested under `/departments/`.
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
  match?: "exact" | "prefix";
  className: string;
  activeClassName: string;
  children: ReactNode;
  agentsLookup?: AgentBreadcrumbContext[];
} & Omit<LinkProps, "href">) {
  const pathname = usePathname();
  let isActive =
    match === "exact"
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");

  if (!isActive && agentsLookup && href.startsWith("/departments/")) {
    const linkSlug = href.slice("/departments/".length);
    const agentMatch = pathname.match(/^\/agents\/([^/]+)/);
    if (agentMatch) {
      const agent = agentsLookup.find((a) => a.id === agentMatch[1]);
      if (agent && agent.department_slug === linkSlug) {
        isActive = true;
      }
    }
  }

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
