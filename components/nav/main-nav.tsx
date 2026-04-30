import Link from "next/link";

import { siteConfig } from "@/config/site";
import { signOut } from "@/lib/actions/auth";
import {
  isCurrentUserAdmin,
  requireAuthUser,
  userHasDeletedAgents,
} from "@/lib/auth/access";

/**
 * Main navigation shown on every authenticated page (via
 * app/(app)/layout.tsx). Server component — admin and trash gates each
 * issue a small read against Supabase before render. Sign-out is a
 * server action invoked directly from a `<form action={...}>`.
 *
 * The Trash link is conditional: it appears only when the user has at
 * least one soft-deleted agent in the 30-day window. Empty trash =
 * no nav clutter; non-empty trash = a way back. Falls back to always-
 * visible would be acceptable if the count query ever became expensive.
 */
export async function MainNav() {
  const user = await requireAuthUser();
  const [showAdmin, showTrash] = await Promise.all([
    isCurrentUserAdmin(),
    userHasDeletedAgents(user.id),
  ]);

  return (
    <nav
      aria-label="Main"
      className="border-b border-border bg-background"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link
          href="/"
          className="text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {siteConfig.siteTitle}
        </Link>

        <div className="flex items-center gap-4 text-sm">
          {showAdmin ? (
            <Link
              href="/admin"
              className="text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Admin
            </Link>
          ) : null}

          {showTrash ? (
            <Link
              href="/agents/trash"
              className="text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Trash
            </Link>
          ) : null}

          <form action={signOut}>
            <button
              type="submit"
              className="text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
