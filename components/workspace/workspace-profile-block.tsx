"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/actions/auth";

/**
 * Profile block at the bottom of the workspace rail. Visually preserves
 * the legacy static block (avatar circle + truncated name + role label
 * pinned to the rail's bottom via `mt-auto`); structurally swaps the
 * outer `<div>` for a `<DropdownMenuTrigger>` so the whole block is
 * keyboard-clickable and opens an account menu above the rail.
 *
 * Menu items:
 *  - **Admin / Back to workspace** — conditional on `isAdmin`. Label
 *    and href flip based on whether the current pathname is under
 *    `/workspace/admin`: in admin mode the entry reads "Back to
 *    workspace" and routes to `/workspace`; everywhere else it reads
 *    "Admin" and routes to `/workspace/admin`. Renders as a `<Link>`
 *    via the `render` prop pattern (matches AgentCard's edit link in 11).
 *  - **Sign out** — calls `signOut` server action via `onClick`. The
 *    action's internal `redirect("/login")` propagates through.
 *
 * Sign-out and the mode-aware admin entry both gain visibility from the
 * workspace chrome after the legacy MainNav was retired in 14. `isAdmin`
 * derivation lives upstream in `app/workspace/layout.tsx`; the mode-
 * aware label/href is computed client-side here via `usePathname`.
 */
export function WorkspaceProfileBlock({
  initials,
  displayName,
  roleLabel,
  isAdmin,
}: {
  initials: string;
  displayName: string;
  roleLabel: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const isAdminMode = pathname.startsWith("/workspace/admin");
  const adminItemLabel = isAdminMode ? "Back to workspace" : "Admin";
  const adminItemHref = isAdminMode ? "/workspace" : "/workspace/admin";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Account menu for ${displayName}`}
            className="mt-auto flex w-full items-center gap-[10px] rounded-md border-t border-hairline-strong px-2 pb-[2px] pt-[14px] text-left transition-colors duration-release ease-release motion-reduce:transition-none hover:bg-hairline hover:duration-hover hover:ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        }
      >
        <span
          aria-hidden
          className="grid h-7 w-7 place-items-center rounded-full bg-foreground text-[11px] font-medium text-background"
        >
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium leading-[1.2] tracking-[-0.005em]">
            {displayName}
          </p>
          <p className="truncate text-[11px] text-caption">{roleLabel}</p>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top">
        {isAdmin ? (
          <DropdownMenuItem render={<Link href={adminItemHref} />}>
            {adminItemLabel}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onClick={async (event) => {
            event.preventDefault();
            await signOut();
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
