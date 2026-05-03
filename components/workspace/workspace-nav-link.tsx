"use client";

import Link, { type LinkProps } from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

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
 */
export function WorkspaceNavLink({
  href,
  match = "exact",
  className,
  activeClassName,
  children,
  ...rest
}: {
  href: string;
  match?: "exact" | "prefix";
  className: string;
  activeClassName: string;
  children: ReactNode;
} & Omit<LinkProps, "href">) {
  const pathname = usePathname();
  const isActive =
    match === "exact"
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");

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
