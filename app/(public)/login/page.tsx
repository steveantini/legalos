import { signInWithMagicLink, signInWithPassword } from "./actions";

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
        Enter your email for a sign-in link. If you have a password, use it
        instead.
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

        <label htmlFor="password" className="mt-1 text-sm font-medium">
          Password{" "}
          <span className="font-normal text-muted-foreground">
            (only if signing in with password)
          </span>
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />

        <button
          type="submit"
          className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Send sign-in link
        </button>
        <button
          type="submit"
          formAction={signInWithPassword}
          className="rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Sign in with password
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

      {error === "invalid-credentials" ? (
        <p
          role="alert"
          className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
        >
          Invalid email or password.
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
