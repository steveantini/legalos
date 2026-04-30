import Link from "next/link";

import { getAccessibleDepartments, requireAuthUser } from "@/lib/auth/access";

/**
 * Department picker at /. Replaces the prior "signed in" placeholder
 * page (Session 3b) now that the app has multiple departments wired up.
 *
 * Lists every department the current user has access to as a card; each
 * links to /departments/<slug>. In v1 every user gets all five
 * departments via the seed, so the empty state below is defensive UX
 * for future deployments where access can be restricted by an org-admin.
 */
export default async function HomePage() {
  const user = await requireAuthUser();
  const departments = await getAccessibleDepartments(user.id);

  if (departments.length === 0) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-6">
        <h1 className="text-2xl font-semibold">No departments yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don&apos;t have access to any departments yet. Contact your
          admin to request access.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold">Choose a department</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pick a department to see its templates and your agents.
        </p>
      </header>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {departments.map((dept) => (
          <li key={dept.id}>
            <Link
              href={`/departments/${dept.slug}`}
              className="flex h-full min-h-[160px] flex-col justify-center rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <h2 className="text-base font-semibold">{dept.name}</h2>
              {dept.description ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {dept.description}
                </p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
