"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/actions/auth";
import { MODES, getCurrentMode } from "@/lib/workspace/modes";

/**
 * Profile block at the bottom of the workspace rail. Visually preserves
 * the legacy static block (avatar circle + truncated name + role label
 * pinned to the rail's bottom via `mt-auto`); structurally swaps the
 * outer `<div>` for a `<DropdownMenuTrigger>` so the whole block is
 * keyboard-clickable and opens an account menu above the rail.
 *
 * The menu is a consistent mode switcher (D-077): it shows the same set
 * everywhere — Workspace, Settings, Admin (admins only), then Sign out —
 * with the current mode shown but marked non-clickable (the disabled
 * treatment) so it reads as "you are here" rather than being omitted. The
 * mode list and the current-mode determination both come from the shared
 * `lib/workspace/modes.ts` source, the same one the rail-switcher uses, so
 * the menu and the rail cannot drift. Admin is gated on `isAdmin` (derived
 * upstream in `app/workspace/layout.tsx` via `isCurrentUserAdmin`).
 *
 * Sign out calls the `signOut` server action via `onClick`; its internal
 * `redirect("/login")` propagates through. Behavior unchanged.
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
  const currentMode = getCurrentMode(pathname);
  const modes = MODES.filter((mode) => isAdmin || !mode.adminGated);

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
        {modes.map((mode) =>
          mode.key === currentMode ? (
            // The current mode: shown but non-clickable ("you are here").
            <DropdownMenuItem key={mode.key} disabled aria-current="true">
              {mode.label}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem key={mode.key} render={<Link href={mode.href} />}>
              {mode.label}
            </DropdownMenuItem>
          ),
        )}
        <DropdownMenuSeparator />
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
