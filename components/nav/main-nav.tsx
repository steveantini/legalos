import Link from "next/link";

import { siteConfig } from "@/config/site";
import { signOut } from "@/lib/actions/auth";
import { isCurrentUserAdmin } from "@/lib/auth/access";

/**
 * Main navigation shown on every authenticated page (via
 * app/(app)/layout.tsx). Server component — the admin-link gate calls
 * into Supabase, and sign-out is a server action invoked directly from a
 * `<form action={...}>`.
 */
export async function MainNav() {
  const showAdmin = await isCurrentUserAdmin();

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
