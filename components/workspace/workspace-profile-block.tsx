"use client";

import Link from "next/link";

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
 *  - "Admin" — conditional on `isAdmin`. Routes to `/admin`. Renders as
 *    a `<Link>` via the `render` prop pattern (matches AgentCard's edit
 *    link in 11).
 *  - "Sign out" — calls `signOut` server action via `onSelect`. The
 *    action's internal `redirect("/login")` propagates through.
 *
 * Sign-out and Admin both gain visibility from the workspace chrome
 * after the legacy MainNav was retired in 14. `isAdmin` derivation
 * lives upstream in `(workspace)/layout.tsx` so the data-fetch stays
 * at the layout level (consistent with departments + agents).
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Account menu for ${displayName}`}
            className="mt-auto flex w-full items-center gap-[10px] rounded-md border-t border-hairline-strong px-2 pb-[2px] pt-[14px] text-left transition-colors hover:bg-hairline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
          <DropdownMenuItem render={<Link href="/admin" />}>
            Admin
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
