/**
 * The "How the demo works" reference, for the platform owner (D-166). Plain
 * language so the operator can answer their own questions about the demo
 * without re-deriving it from the code.
 *
 * CURRENCY RULE (D-166, joining D-157/D-158): this panel is part of the
 * done-definition. Any change to how the demo BEHAVES — the model it runs, what
 * the Demo Org seeds, the link mechanics, or the reset/seed flow — reconciles
 * this text in the SAME commit. Its accuracy is enforced by that rule, not by
 * anyone's memory.
 */
export function DemoHowItWorks() {
  return (
    <div className="flex max-w-[68ch] flex-col gap-5 text-[13.5px] leading-[1.6] text-muted-foreground">
      <Block title="Who a demo user is">
        A demo link signs a prospect in silently — no email, no password — as a{" "}
        <strong className="font-medium text-foreground">super_admin</strong> of
        the shared Demo Org. They are isolated from your real organization: the
        Demo Org is a separate tenant, and per-org scoping (D-136) keeps a demo
        user&apos;s connection and policy changes inside the Demo Org.
      </Block>

      <Block title="What they see">
        The Demo Org mirrors your real org&apos;s structure: the same
        departments and the Approved-agent shelf, plus the seeded starter
        workflow templates. Agents run on the current default model (Opus 4.8).
        Connections, Collections, and Research show their honest empty states
        until something is seeded — intentional, not broken.
      </Block>

      <Block title="What they can and cannot do">
        They can run native chat with any agent, start and approve workflows
        from the templates, and explore every department. They cannot reach live
        data: there are no connected repositories (Google Drive and the like)
        and no knowledge collections unless you set them up in the Demo Org, so
        Research has nothing to scope over by default.
      </Block>

      <Block title="How the links work">
        A link works repeatedly for its window — fourteen days by default,
        selectable at mint — then expires on its own. A returning visitor on the
        same link comes back as the same demo user, to their own conversations.
        The raw link is shown once at mint (only its hash is stored); revoking a
        link stops it immediately. The shorter window, revoke, and per-org
        scoping offset the fact that a time-window link, unlike the old
        single-use link, is not burned on first open.
      </Block>

      <Block title="How to refresh the demo">
        To reset the Demo Org to a clean state and bring its agents onto the
        current default model, run{" "}
        <Code>npm run reset-demo-org -- --org-id=&lt;demo_org_id&gt;</Code> (soft
        reset; it keeps existing demo users and minted links). The reset clears
        the seeded workflow templates, so re-seed them right after with{" "}
        <Code>
          npm run seed-workflow-templates -- --org-id=&lt;demo_org_id&gt;
        </Code>
        . Always reset first, then seed.
      </Block>
    </div>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      <p>{children}</p>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] text-foreground">
      {children}
    </code>
  );
}
