import { notFound } from "next/navigation";

import { LaunchpadGrid } from "@/components/launchpad/launchpad-grid";
import { SupportButton } from "@/components/launchpad/support-button";
import { TipsSection } from "@/components/launchpad/tips-section";
import { WelcomeModal } from "@/components/launchpad/welcome-modal";
import { siteConfig } from "@/config/site";
import {
  getAgentsForDepartment,
  getDepartmentIfAccessible,
  requireAuthUser,
} from "@/lib/auth/access";

export default async function DepartmentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireAuthUser();
  const { slug } = await params;
  const department = await getDepartmentIfAccessible(slug);

  if (!department) {
    notFound();
  }

  const agents = await getAgentsForDepartment(department.id);

  return (
    <>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <header>
          <h1 className="text-3xl font-semibold">{department.name}</h1>
          {department.description ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {department.description}
            </p>
          ) : null}
        </header>

        <LaunchpadGrid
          agents={agents}
          departmentSlug={department.slug}
        />

        <TipsSection />
      </main>

      <WelcomeModal departmentName={department.name} />
      <SupportButton supportEmail={siteConfig.adminEmail} />
    </>
  );
}
