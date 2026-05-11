import { cookies } from "next/headers";

import { LoginConfirmation } from "@/components/login/login-confirmation";
import { LoginForm } from "@/components/login/login-form";
import { LoginTopbar } from "@/components/login/login-topbar";
import { safeNextPath } from "@/lib/url/safe-next";

// Mirrors the constant in `./actions.ts`. "use server" files can only
// export async functions, so the cookie name cannot cross the file
// boundary as a shared constant. Keep these two literals in sync.
const PENDING_EMAIL_COOKIE = "legalos_pending_email";

/**
 * Login surface (Session 23 — Step B).
 *
 * Server component that drives a two-state UI:
 *   - Form state (default, or when ?error=...): renders <LoginForm/>
 *   - Confirmation state (?message=check-inbox): renders <LoginConfirmation/>
 *
 * The two states are mutually exclusive — the previous version
 * appended a status message below the form, which read as a half-
 * empty stack. The new behavior swaps the form OUT entirely when
 * the confirmation lands.
 *
 * Email echo on the confirmation reads from the `legalos_pending_email`
 * httpOnly cookie set by the server action. The cookie is path-
 * scoped to /login, sameSite=lax, and 10-minute TTL. If missing or
 * expired the confirmation degrades gracefully to a "to your email"
 * variant.
 *
 * `dynamic = "force-dynamic"` mirrors the landing page so the
 * cookie + querystring read is fresh per request rather than cached
 * at build time.
 */
export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  message?: string;
  error?: string;
  next?: string;
}>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { message, error, next } = await searchParams;
  const showConfirmation = message === "check-inbox";
  const validatedNext = safeNextPath(next);

  let pendingEmail: string | null = null;
  if (showConfirmation) {
    const cookieStore = await cookies();
    pendingEmail = cookieStore.get(PENDING_EMAIL_COOKIE)?.value ?? null;
  }

  return (
    <div className="landing-stage-in grid min-h-screen grid-rows-[auto_1fr] bg-background">
      <LoginTopbar />
      <main className="flex items-center px-6 min-[720px]:px-10">
        <div className="flex w-full max-w-[28rem] flex-col py-12">
          {showConfirmation ? (
            <LoginConfirmation email={pendingEmail} next={validatedNext} />
          ) : (
            <LoginForm error={error} next={validatedNext} />
          )}
        </div>
      </main>
    </div>
  );
}
