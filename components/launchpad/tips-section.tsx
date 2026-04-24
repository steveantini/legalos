export function TipsSection() {
  return (
    <section className="mt-16 rounded-lg border border-border bg-muted/40 p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Before you use these
      </h2>
      <div className="mt-4 space-y-4 text-sm">
        <div>
          <p className="font-medium text-foreground">Privilege matters.</p>
          <p className="mt-1 text-muted-foreground">
            Agent outputs are work product. Review them before sharing
            outside the legal team, and never paste them into external chat
            tools or unvetted AI assistants — privilege can be waived by
            disclosure.
          </p>
        </div>
        <div>
          <p className="font-medium text-foreground">Playbook first.</p>
          <p className="mt-1 text-muted-foreground">
            An agent&apos;s guidance is only as useful as the playbook behind
            it. Flag outdated positions or missing scenarios to legal ops so
            the knowledge base stays current with how the team actually
            negotiates.
          </p>
        </div>
      </div>
    </section>
  );
}
