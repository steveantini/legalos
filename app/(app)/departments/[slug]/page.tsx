import { notFound } from "next/navigation";

import { getDepartmentIfAccessible, requireAuthUser } from "@/lib/auth/access";

export default async function DepartmentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireAuthUser();
  const { slug } = await params;
  const department = await getDepartmentIfAccessible(slug);

  if (!department) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">{department.name} Department</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Signed in as{" "}
        <span className="font-medium text-foreground">{user.email}</span>.
      </p>
      <p className="mt-4 text-sm text-muted-foreground">
        Minimal placeholder — agent cards, admin views, and the rest arrive
        in later sessions.
      </p>
    </main>
  );
}
