import { MarketingSection } from "@/components/marketing/marketing-page";

/**
 * The public documentation's content (Documentation arc Step 1, D-158): one
 * entry per page, consumed by the /documentation hub and the
 * /documentation/[slug] route. Role-structured because the product's
 * permission model is role-shaped: user guides first, administrator guides
 * after, every page stating its audience quietly. Administrator pages are
 * deliberately PUBLIC (the governance story is the trust differentiator);
 * platform-owner material is deliberately ABSENT (docs/OPERATOR.md, internal).
 *
 * Depth standard: TOUR-DEPTH — what the feature is, what you can do with it,
 * and how, written from the reader's seat. Every behavioral claim was
 * verified against the product before writing (the D-157 discipline, extended
 * to these pages by D-158: commits that change user-facing behavior reconcile
 * the relevant page here in the same commit). Register: calm and useful, no
 * em dashes, sentence case, curly apostrophes. No screenshots by design
 * (they rot); the prose is written so none are needed.
 */

export type DocGroup = "users" | "admins";

export type DocPage = {
  slug: string;
  group: DocGroup;
  title: string;
  /** One line for the hub list. */
  summary: string;
  /** The quiet audience line under the title. */
  audience: string;
  /** The page lead. */
  lead: string;
  body: React.ReactNode;
};

export const DOC_PAGES: DocPage[] = [
  // ===========================================================================
  // For everyone
  // ===========================================================================
  {
    slug: "getting-started",
    group: "users",
    title: "Getting started",
    summary: "Signing in, finding your way around, and what you can reach.",
    audience: "For everyone",
    lead: "legalOS is invite-only. Once your administrator has invited you, getting in takes an email address and nothing else.",
    body: (
      <>
        <MarketingSection title="Signing in">
          <p>
            There are no passwords. Enter your work email on the sign-in page
            and legalOS sends you a sign-in link; opening it signs you in.
            There is no public signup: if your email isn&rsquo;t recognized,
            ask your administrator for an invitation.
          </p>
        </MarketingSection>
        <MarketingSection title="The home page">
          <p>
            You arrive on your workspace home: a greeting, your departments,
            and your Impact card, which fills in as you use the product. The
            left rail is the map: your departments at the top, then Knowledge,
            Workflows, and Help, with Settings and your profile at the bottom.
            The date and a breadcrumb trail sit in the top bar, so you always
            know where you are.
          </p>
        </MarketingSection>
        <MarketingSection title="Departments and access">
          <p>
            legalOS organizes work the way a legal team is organized: by
            department, like Commercial, Privacy, or Litigation. Your
            administrator decides which departments are yours. Departments you
            can&rsquo;t access appear locked rather than hidden, so you can
            see the shape of the workspace and request access when your work
            calls for it.
          </p>
        </MarketingSection>
      </>
    ),
  },
  {
    slug: "workspace",
    group: "users",
    title: "The workspace and launchpad",
    summary: "Agent groups and their trust tiers, conversations, attachments, exports, and undo.",
    audience: "For everyone",
    lead: "Each department opens to a launchpad: its agents, organized into three clearly marked groups so you always know what you’re working with.",
    body: (
      <>
        <MarketingSection title="The three agent groups">
          <p>
            <strong>Approved agents</strong>{" "}are the department&rsquo;s own,
            vetted and tested by your department. <strong>Claude for
            Legal</strong>{" "}is a curated library of Anthropic&rsquo;s legal
            agents, ready to use. <strong>My agents</strong>{" "}are the ones you
            create yourself, yours to shape and experiment with. Each group
            carries a one-line description on the launchpad, so the trust
            model reads at a glance.
          </p>
        </MarketingSection>
        <MarketingSection title="Conversations">
          <p>
            Opening an agent starts or resumes a conversation. Conversations
            are kept: leave and come back, and the thread picks up where it
            left off. Each conversation remembers the model it started with,
            so older work stays reproducible even as defaults change.
          </p>
        </MarketingSection>
        <MarketingSection title="Attachments and exports">
          <p>
            Attach references so an agent works from your documents: files you
            upload, or files picked straight from a connected Google Drive,
            which the agent reads live at answer time. When an answer is worth
            keeping, copy it, or export it to Word from the menu beside it;
            the export carries the answer&rsquo;s citations as footnotes.
          </p>
        </MarketingSection>
        <MarketingSection title="Deleting and undo">
          <p>
            Deleting an agent is reversible: it moves to Trash, where it can
            be restored for 30 days before it is gone for good. You&rsquo;ll
            find Trash from the agents area whenever something is in it.
          </p>
        </MarketingSection>
      </>
    ),
  },
  {
    slug: "chat",
    group: "users",
    title: "Chatting with agents",
    summary: "What agents can do, where citations come from, and why some actions pause for your approval.",
    audience: "For everyone",
    lead: "An agent reads, reasons, and drafts. When it reaches beyond the conversation, into the web or your connected systems, the rules are simple: reading is open, acting waits for you.",
    body: (
      <>
        <MarketingSection title="What an agent works from">
          <p>
            An agent answers from its instructions, the conversation, and
            whatever you attach. Agents with web search enabled can also
            search the open web, and when your organization has connected
            systems like Google Workspace, agents can read from them too. A
            quiet line in the conversation shows each tool call as it runs,
            named plainly, like Google Drive: search files.
          </p>
        </MarketingSection>
        <MarketingSection title="Citations and sources">
          <p>
            When an answer draws on the web or your documents, its sources are
            listed with the answer, each a real link. Citations carry into the
            Word export as footnotes. An answer that rests on sources is one
            you can check, and legalOS expects you to: treat agent output as a
            strong draft for your review, not a finished opinion.
          </p>
        </MarketingSection>
        <MarketingSection title="When an agent wants to act">
          <p>
            Reading runs freely. Any action that would change something
            outside legalOS, like sending an email or creating a file, pauses
            the conversation and shows you exactly what the agent wants to do.
            Nothing happens until you approve that specific action; decline
            it, and the agent acknowledges and carries on without it. This is
            not a setting you can turn off, and that is deliberate.
          </p>
        </MarketingSection>
        <MarketingSection title="Research in chat">
          <p>
            If your organization uses Knowledge collections, an agent can
            research them mid-conversation for small questions, reading up to
            15 documents and citing what it finds. Bigger questions get an
            honest answer instead: the agent will point you to the Research
            page, which is built for corpus-scale work.
          </p>
        </MarketingSection>
      </>
    ),
  },
  {
    slug: "workflows",
    group: "users",
    title: "Workflows",
    summary: "Running multi-step work, supervised or autonomous, with approvals and a complete record.",
    audience: "For everyone",
    lead: "A workflow chains agents into a repeatable process. You provide the input, choose how much supervision you want, and follow the run step by step.",
    body: (
      <>
        <MarketingSection title="Running a workflow">
          <p>
            From My Workflows, pick an active workflow and choose Run. You
            give it the starting input, pick the autonomy level, and start.
            The run view shows each step as it executes: what went in, what
            came out, and how long it took.
          </p>
        </MarketingSection>
        <MarketingSection title="Supervised and autonomous">
          <p>
            A supervised run pauses at every checkpoint a workflow defines and
            before any action that changes something outside legalOS. An
            autonomous run clears its own checkpoints, but here is the
            important part: even an autonomous run still pauses before any
            write. No workflow sends, files, or creates anything without a
            person approving that specific action.
          </p>
        </MarketingSection>
        <MarketingSection title="Approvals">
          <p>
            When a run pauses, it shows an approval card: what the step wants
            to do, named plainly. For an action an agent proposed itself, you
            can open a disclosure to see exactly what it will send before
            deciding. Approve and the action runs once; deny and the run
            handles it gracefully.
          </p>
        </MarketingSection>
        <MarketingSection title="The run record">
          <p>
            Every run keeps a complete, ordered record: each step, its input
            and output, and whether a person approved it or it proceeded
            automatically, with who decided. Runs survive even if the workflow
            that produced them is later deleted, because each run stores its
            own copy of the steps it executed.
          </p>
        </MarketingSection>
      </>
    ),
  },
  {
    slug: "knowledge",
    group: "users",
    title: "Knowledge and Research",
    summary: "Collections of your team’s documents, and citation-backed answers across them.",
    audience: "For everyone",
    lead: "Your team’s documents stay where they live. Collections give them a shape, and Research asks questions across them.",
    body: (
      <>
        <MarketingSection title="Collections, as you see them">
          <p>
            A collection is a named scope your administrators draw over the
            repositories your team already uses, like a contracts folder in
            Google Drive. Every collection shows exactly where its documents
            live, down to the folder, along with a document count and when it
            was last synced. Some collections are visible to the whole
            organization; others only to certain departments, which is why
            your list may differ from a colleague&rsquo;s.
          </p>
        </MarketingSection>
        <MarketingSection title="Asking a question">
          <p>
            On the Research page, write your question, pick the collections to
            read, and review the preview: how many documents are in scope and
            roughly how long the run will take. Then run it. Research reads
            every document in scope live, where it lives; nothing is copied or
            stored, and legalOS keeps only an inventory of titles.
          </p>
        </MarketingSection>
        <MarketingSection title="The answer and the findings">
          <p>
            You watch progress as documents are read, with findings filling in
            as it goes. The answer arrives with citations linking to the
            documents themselves and a per-document findings table: each
            document, whether it was relevant, what it says about your
            question, and a supporting excerpt. The answer also states its
            basis plainly, including anything that couldn&rsquo;t be read. As
            everywhere in legalOS, it is a model&rsquo;s read of the
            documents: verify against the cited sources before relying on it.
          </p>
        </MarketingSection>
        <MarketingSection title="History, deleting, and exporting">
          <p>
            Past runs are kept and reopenable, and an interrupted run resumes
            where it left off. You can delete your own runs (findings are
            removed; cost records are retained), and a completed run exports
            to Word as a memo carrying the question, the scope, the cited
            answer, and the findings.
          </p>
        </MarketingSection>
      </>
    ),
  },
  {
    slug: "impact",
    group: "users",
    title: "Your impact",
    summary: "What the home Impact card shows, and which numbers are measured versus estimated.",
    audience: "For everyone",
    lead: "The Impact card on your home page shows what your use of legalOS is giving back. It is honest about which numbers are real measurements and which are informed estimates.",
    body: (
      <>
        <MarketingSection title="What it shows">
          <p>
            Your runs, your most-used agent, and your estimated hours and cost
            saved, switchable across week, month, and year to date, each with
            a change against the prior period.
          </p>
        </MarketingSection>
        <MarketingSection title="Measured versus estimated">
          <p>
            How often you run things is measured: it comes from real usage.
            Hours and cost saved are estimates: your measured run volume
            blended with assumptions your administrators set, like time saved
            per task and a blended rate. legalOS labels which is which
            everywhere it shows a number, and until your administrators
            configure those assumptions, the cells say so rather than showing
            an invented figure.
          </p>
        </MarketingSection>
      </>
    ),
  },

  // ===========================================================================
  // For administrators
  // ===========================================================================
  {
    slug: "people",
    group: "admins",
    title: "People and roles",
    summary: "Invitations, the role model, and reversible deactivation.",
    audience: "For administrators",
    lead: "The People area is where your organization’s membership is governed: who belongs, what role they hold, which departments they can reach.",
    body: (
      <>
        <MarketingSection title="Inviting someone">
          <p>
            Invite by email, choosing a role and the departments they start
            with. The invitation arrives by email; on first sign-in the person
            lands provisioned with exactly what you chose. Pending invitations
            can be resent or revoked from the same surface.
          </p>
        </MarketingSection>
        <MarketingSection title="Roles and the escalation rule">
          <p>
            Three org roles: user, org admin, and super admin. Role changes
            follow a least-privilege rule enforced in the interface, on the
            server, and in the database: only a super admin can grant super
            admin, an org admin manages only the user and org admin levels,
            the last super admin can never be demoted, and demoting yourself
            asks you to confirm.
          </p>
        </MarketingSection>
        <MarketingSection title="Deactivation">
          <p>
            Deactivating a person is a reversible block, not a deletion:
            their access stops immediately, their work and history remain, and
            reactivating restores them. The same guardrails apply: an org
            admin can&rsquo;t deactivate a super admin, and the last active
            super admin can&rsquo;t be deactivated. Every role and status
            change is recorded to the audit log.
          </p>
        </MarketingSection>
      </>
    ),
  },
  {
    slug: "policy",
    group: "admins",
    title: "Policy and access",
    summary: "The organization’s levers: model, connections, capability ceiling, content, and the research cap.",
    audience: "For administrators",
    lead: "Policy and access is one page holding the organization’s governance levers, each enforced server-side and at the database, not just in the interface.",
    body: (
      <>
        <MarketingSection title="The model and whose key">
          <p>
            Choose which AI provider powers the organization and whose
            credentials it runs on: the managed legalOS key, or your own
            provider key, validated before it is stored, encrypted at rest,
            and never shown again. Separately, set the default model new
            agents start with; existing agents and conversations keep theirs.
          </p>
        </MarketingSection>
        <MarketingSection title="Allowed connections and the capability ceiling">
          <p>
            Decide which kinds of connections the organization permits, from
            file storage and mail through MCP servers, and set the capability
            ceiling: whether agents may act read-only or read-and-write.
            Tightening the policy takes effect immediately, even for
            connections granted earlier.
          </p>
        </MarketingSection>
        <MarketingSection title="The research document cap">
          <p>
            How many documents a single research run may read, 200 by default.
            A scope over the cap is declined before it runs, with the cap
            named, so research cost stays a deliberate choice rather than a
            surprise.
          </p>
        </MarketingSection>
        <MarketingSection title="Content libraries">
          <p>
            Turn curated content libraries, like Claude for Legal, on or off
            for the organization. Off genuinely hides that library&rsquo;s
            agents everywhere; a quiet line shows when each library was last
            updated from its source.
          </p>
        </MarketingSection>
      </>
    ),
  },
  {
    slug: "connections",
    group: "admins",
    title: "Connections",
    summary: "The pre-vetted catalog, connecting a system, and how credentials are held.",
    audience: "For administrators",
    lead: "legalOS connects only to systems it has vetted: official first-party servers from a pre-vetted catalog, or a server your own organization hosts. There is deliberately no way to connect an arbitrary third party.",
    body: (
      <>
        <MarketingSection title="The catalog">
          <p>
            The catalog covers the systems legal teams live in: contract
            lifecycle, document management, e-discovery, court data and
            research, and the productivity layer around them. Each entry says
            honestly what it needs, like requiring your own Ironclad account.
            Verified means legalOS has proven the full path live, connect,
            discover tools, and run a real read; available means pre-vetted
            from a trusted source and verified as customers enable it. Google
            Workspace is verified end to end today.
          </p>
        </MarketingSection>
        <MarketingSection title="Connecting a system">
          <p>
            Connecting is a super admin action: pick the server, sign in with
            the organization&rsquo;s own account for that system, and approve
            the access it asks for. At connection, legalOS discovers what the
            server can do and shows you the tool list. Two policies must both
            agree before agents can use it: the server is connected and
            healthy, and the MCP category is allowed in Policy and access.
          </p>
        </MarketingSection>
        <MarketingSection title="Credential custody, in plain language">
          <p>
            The keys and tokens a connection produces are encrypted and stored
            in a vault only the server can read. They never reach a browser,
            never appear in logs, and are deleted when you disconnect. When a
            token expires, legalOS renews it itself. What you see in the
            interface is only the connection&rsquo;s status, never its
            secrets.
          </p>
        </MarketingSection>
      </>
    ),
  },
  {
    slug: "collections",
    group: "admins",
    title: "Managing collections",
    summary: "Drawing scopes over repositories, syncing the inventory, and department visibility.",
    audience: "For administrators",
    lead: "Collections are the shape you give the organization’s knowledge: named scopes over connected repositories, transparent about their sources, holding an inventory and never the documents.",
    body: (
      <>
        <MarketingSection title="Creating a collection">
          <p>
            Name it, describe it, and choose who sees it: everyone, or
            specific departments, enforced at the database, not just hidden in
            the interface. Then add sources by browsing a connected repository
            to a folder. The folder is referenced by its stable identifier, so
            renames and moves don&rsquo;t break it, and its path is shown as
            provenance everywhere the collection appears.
          </p>
        </MarketingSection>
        <MarketingSection title="Syncing the inventory">
          <p>
            Sync walks each source and records an inventory: titles, types,
            sizes, and links, never document content. Documents that disappear
            upstream are marked missing rather than silently dropped, and very
            large trees sync in bounded passes with live progress. The
            inventory powers previews and counts; research itself always reads
            live, so a slightly stale inventory only affects the preview
            numbers.
          </p>
        </MarketingSection>
        <MarketingSection title="Which repositories qualify">
          <p>
            A collection source needs a repository that can be enumerated,
            listed folder by folder with stable identifiers. Google Drive
            qualifies and is verified live; Box is supported per its
            documentation. Search-style sources, like a public case-law
            service, are not collection material; they belong to a different,
            future part of Research.
          </p>
        </MarketingSection>
      </>
    ),
  },
  {
    slug: "workflows-administration",
    group: "admins",
    title: "Administering workflows",
    summary: "Building in the no-code editor, templates, and what autonomy levels really mean.",
    audience: "For administrators",
    lead: "Building workflows is an admin activity; running them is for everyone who can see them. The builder is no-code, and the safety rules are structural.",
    body: (
      <>
        <MarketingSection title="Building">
          <p>
            A workflow is an ordered list of steps: run an agent, take an
            action, or pause for human approval. Lead with agents; give an
            agent step a plain-language instruction and it composes with the
            agent&rsquo;s own role. Available actions come live from your
            connected systems, so a newly connected tool appears
            automatically, with anything that writes marked as requiring
            approval. A live readback panel describes what the workflow does
            in plain language as you build.
          </p>
        </MarketingSection>
        <MarketingSection title="Templates">
          <p>
            Starter templates ship with the product and appear alongside My
            Workflows. A template is never run directly: using one forks it
            into your own draft to adapt, so the starting points stay clean.
          </p>
        </MarketingSection>
        <MarketingSection title="Autonomy, honestly">
          <p>
            Autonomy is chosen per run, not built into the workflow. The line
            that never moves: writes pause for a person, at every autonomy
            level. Deleting a workflow never deletes its history; every run
            keeps its own copy of the steps it executed, and cost records are
            kept as accounting facts.
          </p>
        </MarketingSection>
      </>
    ),
  },
  {
    slug: "insights",
    group: "admins",
    title: "Insights and the calculator",
    summary: "Adoption and engagement, and the measured-plus-assumptions return estimate.",
    audience: "For administrators",
    lead: "Insights shows how the organization is actually adopting legalOS, and the Productivity calculator turns that into a return figure that is honest about what it is.",
    body: (
      <>
        <MarketingSection title="Insights">
          <p>
            Who is active, how usage is trending over week, month, or year to
            date, which agents and departments carry the work, and which
            agents nobody has used yet, the adoption gap worth acting on. All
            of it is real, measured usage; cost deliberately doesn&rsquo;t
            appear here. Before real usage accrues, a clearly labeled sample
            view previews the experience.
          </p>
        </MarketingSection>
        <MarketingSection title="The calculator and the task book">
          <p>
            The calculator blends measurement with your assumptions. How often
            each tracked task runs is measured from real usage; salary and
            time saved per run are estimates you set in the organization&rsquo;s
            task book, which super admins edit and other admins read. Every
            input and result is labeled measured or estimate, and the same
            task book powers each person&rsquo;s home Impact card.
          </p>
        </MarketingSection>
      </>
    ),
  },
  {
    slug: "audit",
    group: "admins",
    title: "The audit log",
    summary: "What is recorded today, and what it honestly does not yet cover.",
    audience: "For administrators",
    lead: "The audit log is a read-only, chronological record of privileged membership changes, written by the database itself when the change happens.",
    body: (
      <>
        <MarketingSection title="What is recorded">
          <p>
            Role changes, who changed whose role and to what, and
            activations and deactivations, each with the actor, the person
            affected, and the time. Changes made outside the product show
            honestly as made by the system rather than being dressed up as a
            person&rsquo;s action. Separately, every workflow run keeps its
            own immutable step-by-step record, including approval provenance.
          </p>
        </MarketingSection>
        <MarketingSection title="What it does not yet cover">
          <p>
            Policy edits, connection changes, and invitation lifecycle events
            are not yet in the audit log; widening it to cover them is on the
            roadmap, and we say so here rather than implying otherwise.
          </p>
        </MarketingSection>
      </>
    ),
  },
];

export function getDocPage(slug: string): DocPage | undefined {
  return DOC_PAGES.find((page) => page.slug === slug);
}

export const DOC_GROUP_LABELS: Record<DocGroup, { title: string; blurb: string }> = {
  users: {
    title: "For everyone",
    blurb: "Using legalOS day to day: the workspace, agents, workflows, knowledge, and your impact.",
  },
  admins: {
    title: "For administrators",
    blurb: "Governing the workspace: people, policy, connections, collections, and measurement. Public on purpose, because how legalOS is governed is part of why it can be trusted.",
  },
};
