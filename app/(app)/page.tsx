import Link from "next/link";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <h1 className="text-2xl font-semibold">Legal AI Launchpad</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You are not signed in.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">Signed in</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Signed in as{" "}
        <span className="font-medium text-foreground">{user.email}</span>.
      </p>
      <p className="mt-4 text-sm text-muted-foreground">
        Route protection, role checks, and department pages are coming in
        Session 3b and beyond.
      </p>
    </main>
  );
}
