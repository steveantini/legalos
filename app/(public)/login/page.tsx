import { signInWithMagicLink } from "./actions";

type SearchParams = Promise<{ message?: string; error?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { message, error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter your work email and we&apos;ll send you a sign-in link.
      </p>

      <form action={signInWithMagicLink} className="mt-6 flex flex-col gap-3">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Send sign-in link
        </button>
      </form>

      {message === "check-inbox" ? (
        <p
          role="status"
          className="mt-4 rounded-md bg-muted p-3 text-sm text-muted-foreground"
        >
          Check your inbox for a sign-in link. If it doesn&apos;t arrive in a
          minute, check spam or request another.
        </p>
      ) : null}

      {error === "invalid-email" ? (
        <p
          role="alert"
          className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
        >
          Please enter a valid email address.
        </p>
      ) : null}

      {error === "invalid-link" ? (
        <p
          role="alert"
          className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
        >
          That sign-in link is invalid or expired. Request a new one.
        </p>
      ) : null}
    </main>
  );
}
