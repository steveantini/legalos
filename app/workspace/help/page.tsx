import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Help",
};

export default function HelpPage() {
  return (
    <main className="flex flex-col gap-9">
      <header>
        <h1 className="text-3xl font-semibold">Help</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Guides, walkthroughs, and product references.
        </p>
      </header>
      <section className="max-w-prose">
        <p className="text-sm text-foreground">
          Help is where you&apos;ll find documentation for every part of
          legalOS — getting started, managing departments, configuring
          agents, sharing workflows, and tracking adoption. An
          AI-powered help chat that can answer product questions in
          natural language is on the roadmap; for now, browseable
          guides land here in the next session.
        </p>
        <p className="mt-6 text-sm text-caption">
          In development — Session 35 ships the initial guides library.
        </p>
      </section>
    </main>
  );
}
