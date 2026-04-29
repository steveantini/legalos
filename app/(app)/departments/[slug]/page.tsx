import Link from "next/link";
import { notFound } from "next/navigation";

import { AgentGrid } from "@/components/launchpad/agent-grid";
import { SupportButton } from "@/components/launchpad/support-button";
import { TipsSection } from "@/components/launchpad/tips-section";
import { WelcomeModal } from "@/components/launchpad/welcome-modal";
import { buttonVariants } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import {
  getAgentsForDepartmentSplit,
  getDepartmentIfAccessible,
  requireAuthUser,
} from "@/lib/auth/access";

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

  const { templates, myAgents } = await getAgentsForDepartmentSplit(
    department.id,
    user.id,
  );

  const newAgentHref = `/agents/new?department=${department.slug}`;

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

        <section className="mt-10">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Templates
          </h2>
          {templates.length > 0 ? (
            <AgentGrid
              agents={templates}
              departmentSlug={department.slug}
              isTemplate
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No templates available for this department yet.
            </p>
          )}
        </section>

        <section className="mt-12">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              My Agents
            </h2>
            {myAgents.length > 0 ? (
              <Link href={newAgentHref} className={buttonVariants({ size: "sm" })}>
                Create new agent
              </Link>
            ) : null}
          </div>
          {myAgents.length > 0 ? (
            <AgentGrid agents={myAgents} departmentSlug={department.slug} />
          ) : (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">
                You haven&apos;t created any agents yet. Pick a template above to fork,
                or create one from scratch.
              </p>
              <Link
                href={newAgentHref}
                className={buttonVariants({ className: "mt-4" })}
              >
                Create new agent
              </Link>
            </div>
          )}
        </section>

        <TipsSection />
      </main>

      <WelcomeModal departmentName={department.name} />
      <SupportButton supportEmail={siteConfig.adminEmail} />
    </>
  );
}
