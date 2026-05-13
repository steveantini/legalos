import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Workflows",
};

export default function WorkflowsPage() {
  return (
    <main className="flex flex-col gap-9">
      <header>
        <h1 className="text-3xl font-semibold">Workflows</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Compose multi-step agentic sequences from natural language.
        </p>
      </header>
      <section className="max-w-prose">
        <p className="text-sm text-foreground">
          Workflows let you orchestrate complex legal tasks by chaining
          together capabilities your agents already have — research,
          drafting, review, extraction — into reusable, multi-step
          procedures. Build a workflow once; run it across departments
          and matters. Coming in a future release.
        </p>
        <p className="mt-6 text-sm text-caption">
          In development — Session 33 ships the workflow builder.
        </p>
      </section>
    </main>
  );
}
