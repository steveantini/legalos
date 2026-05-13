import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Integrations",
};

export default function IntegrationsPage() {
  return (
    <main className="flex flex-col gap-9">
      <header>
        <h1 className="text-3xl font-semibold">Integrations</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect legalOS to the systems your team already uses.
        </p>
      </header>
      <section className="max-w-prose">
        <p className="text-sm text-foreground">
          Integrations let your agents read from and write to the
          operational tools where legal work actually happens — contract
          lifecycle managers, document management systems, matter
          management, email, and calendar. Connections are configured
          once at the admin level via MCP; agents pick up new sources
          automatically. Coming in a future release.
        </p>
        <p className="mt-6 text-sm text-caption">
          In development — Session 34 ships the integrations surface.
        </p>
      </section>
    </main>
  );
}
