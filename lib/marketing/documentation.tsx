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
        <MarketingSection title="How to">
          <div>
            <p className="font-medium text-foreground">Sign in</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>Open the sign-in page and enter your work email.</li>
              <li>Open the sign-in link legalOS emails you.</li>
              <li>
                You land on your workspace home. If your email isn&rsquo;t
                recognized, ask your administrator for an invitation; there is
                no public signup.
              </li>
            </ol>
          </div>
        </MarketingSection>
      </>
    ),
  },
  {
    slug: "workspace",
    group: "users",
    title: "The workspace and launchpad",
    summary: "Agent groups and their trust tiers, conversations, attachments, exports, undo, and your Desk of personal content feeds.",
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
        <MarketingSection title="Your Desk">
          <p>
            The Desk at the bottom of your home holds the reading you follow.
            Add a Substack, a podcast, or a news source by pasting its link: a
            direct feed, an ordinary page (legalOS finds the feed for you), or
            an Apple Podcasts show (resolved to the show&rsquo;s feed). Each
            source becomes a card showing its latest post, its title and image,
            linking out to read it. The feeds are personal to you, kept up to
            date for you, and you can keep up to twelve. Curated reading chosen
            for your role may appear alongside your own feeds here in time.
          </p>
        </MarketingSection>
        <MarketingSection title="How to">
          <div>
            <p className="font-medium text-foreground">Create an agent of your own</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>Open the department the agent belongs to.</li>
              <li>Select New agent at the top of the launchpad.</li>
              <li>
                Name it, write its instructions in System prompt, and pick a
                model. Attach reference files if it should always work from
                them, and turn on Web search if it should reach the open web.
              </li>
              <li>
                Select Save agent. It appears under My agents on that
                launchpad, visible only to you.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Add an approved agent to a department</p>
            <p className="mt-1 text-[13.5px] text-muted-foreground">
              You&rsquo;ll need an org admin or super admin for this; the
              affordance only appears for them.
            </p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>Open the department&rsquo;s launchpad.</li>
              <li>
                Select New approved agent. Admins see it next to New personal
                agent, which creates a personal one.
              </li>
              <li>Fill in the same form: name, instructions, model, tools.</li>
              <li>
                Select Save agent. It appears under Approved agents for
                everyone in the organization.
              </li>
            </ol>
            <p className="mt-2 text-[13.5px] text-muted-foreground">
              There is no promote action today: an existing personal agent
              can&rsquo;t be flipped to approved. To adopt one, an admin
              recreates it as an approved agent, copying its instructions
              across.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">Make an approved or library agent your own</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>Open the agent and select Customize, top right.</li>
              <li>
                legalOS creates your own copy under My agents, named with (My
                Copy), and carries the current conversation over to it.
              </li>
              <li>Edit your copy freely; the original is untouched.</li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Edit or delete an agent</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                On the agent&rsquo;s launchpad card, open the small menu and
                choose Edit or Delete. You can edit and delete your own
                agents; admins can also edit and delete approved agents.
              </li>
              <li>
                Editing opens the same form as creation; select Save changes.
              </li>
              <li>
                Deleting moves the agent to Trash and offers Undo right in the
                confirmation toast.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Restore a deleted agent</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>Open Trash from the agents area.</li>
              <li>
                Find the agent and select Restore. You have 30 days from
                deletion; after that it can no longer be restored.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Start a conversation</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>Select an agent&rsquo;s card on the launchpad.</li>
              <li>
                Type in the composer and press Enter. The conversation is
                kept; leaving and returning picks up the same thread.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Attach files to a message</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>Select the + button in the composer.</li>
              <li>
                Choose Upload from computer, or Google Drive when your
                organization has it connected.
              </li>
              <li>
                Up to 5 files per message: PDF, Word, text, Markdown, or
                Excel. Attached files appear as chips above your message.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Keep an answer</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                Use the copy button beneath the answer to copy it as it
                stands.
              </li>
              <li>
                Or open the menu beside it and choose Export to Word (.docx);
                the document carries the answer&rsquo;s citations as
                footnotes.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Add a feed to your Desk</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>On your home, find the Desk at the bottom.</li>
              <li>
                Select Add feed, or Add your first feed if your Desk is empty.
              </li>
              <li>
                Paste a link and select Add feed. It can be a feed address, a
                publication&rsquo;s page, or an Apple Podcasts show link;
                legalOS resolves the feed either way.
              </li>
              <li>
                The source appears as a card with its latest post. To remove
                one, hover its card and select the remove control. Your feeds
                are personal to you.
              </li>
            </ol>
          </div>
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
        <MarketingSection title="How to">
          <div>
            <p className="font-medium text-foreground">Put an agent&rsquo;s tools to work</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                Ask for something that needs them: current information for an
                agent with Web search on, or a document in a connected system
                (&ldquo;find our latest MSA in Drive&rdquo;).
              </li>
              <li>
                The agent decides when to reach for a tool; each call shows as
                a quiet line in the conversation, named plainly, like Google
                Drive: search files.
              </li>
              <li>
                Web search is enabled per agent: turn it on in the
                agent&rsquo;s settings if yours doesn&rsquo;t have it.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Approve or decline an action</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                When an agent wants to change something outside legalOS, a
                card pauses the conversation and names the action, like
                creating a file on Google Drive.
              </li>
              <li>Review what it will do, then select Approve or Deny.</li>
              <li>
                Approving runs that one action; denying it lets the agent
                acknowledge and carry on without it. Nothing runs without
                your decision.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Follow a citation</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                Select a numbered marker in the answer to jump to its entry in
                the Sources list beneath it.
              </li>
              <li>
                Each source is a real link; open it to verify the answer
                against the material itself before relying on it.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Switch the model</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                Select the model name in the composer and pick from the quick
                list.
              </li>
              <li>
                The change applies to the agent from here on; existing
                conversations keep the model they started with. You can switch
                models on your own agents, and admins on approved agents.
              </li>
            </ol>
          </div>
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
        <MarketingSection title="How to">
          <div>
            <p className="font-medium text-foreground">Run a workflow</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>Open Workflows in the rail and pick My workflows.</li>
              <li>Select Run on an active workflow.</li>
              <li>
                Provide the starting input under Input for this run; the
                first step receives it.
              </li>
              <li>
                Choose the autonomy for this run: Supervised pauses at every
                checkpoint, Autonomous clears checkpoints itself but still
                pauses before any write.
              </li>
              <li>Select Start run and follow the run view.</li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Approve a paused run</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                A paused run shows its approval card at the top of the run
                view, naming what the step wants to do.
              </li>
              <li>
                For an action an agent proposed itself, open Show what it will
                send to read the exact content first.
              </li>
              <li>
                Select Approve to let that one action run, or Deny. Only the
                person who started the run can decide.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Read a run record</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                Open any run: each step lists its input, its output, its
                status, and how long it took.
              </li>
              <li>
                Approvals show who decided. The record is the run&rsquo;s own
                copy, so it survives even if the workflow is later deleted.
              </li>
            </ol>
          </div>
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
        <MarketingSection title="How to">
          <div>
            <p className="font-medium text-foreground">Run research</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>Open Knowledge in the rail and pick Research.</li>
              <li>
                Write your question in the composer, like &ldquo;Which of our
                vendor agreements auto-renew?&rdquo;
              </li>
              <li>
                In Scope, tick the collections to read. The summary line
                updates as you choose: collections, about how many documents,
                and roughly how long.
              </li>
              <li>
                Select Run research and watch progress as documents are read,
                findings filling in as it goes.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Read the findings</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                The answer arrives with numbered citations linking to the
                documents themselves, and a basis line stating what was read
                and what couldn&rsquo;t be.
              </li>
              <li>
                Below it, the findings table lists each document and its
                determination: relevant, not relevant, or honestly unreadable.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Export or delete a run</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                Open the menu at the top of a settled run and choose Export to
                Word (.docx) for the full memo.
              </li>
              <li>
                Choose Delete run to remove it; findings are removed, cost
                records are retained, and a run still in progress is cancelled
                first. You can delete your own runs; admins can delete any in
                the organization.
              </li>
              <li>Past runs stay listed under Past runs until you do.</li>
            </ol>
          </div>
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
        <MarketingSection title="How to">
          <div>
            <p className="font-medium text-foreground">Read the card</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                Switch the window with the toggle: Week, Month, or YTD.
              </li>
              <li>
                Four cells: Hours saved and Estimated cost saved (estimates),
                Agent runs and Top agent (measured). Each shows its change
                against the prior period.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Get the estimates configured</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                Cells reading Setup needed mean the organization&rsquo;s task
                book hasn&rsquo;t been filled in yet.
              </li>
              <li>
                That lives in the Productivity Calculator, and only a super
                admin can edit it; ask yours, or if that&rsquo;s you, the
                insights guide walks through it. Admins see a direct link on
                the card.
              </li>
            </ol>
          </div>
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
        <MarketingSection title="How to">
          <div>
            <p className="font-medium text-foreground">Invite someone</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>Open People and select Invite person.</li>
              <li>
                Enter their email and choose a role. Org admins can offer
                User and Org admin; only a super admin can offer Super admin.
              </li>
              <li>
                Pick the departments they start with, or leave it empty to
                grant access later.
              </li>
              <li>
                Send it. The invitation arrives by email, and it appears
                under pending invitations, where you can Resend or Revoke it.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Change a role</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>Open the person&rsquo;s row in People.</li>
              <li>
                Change Organization role. The guardrails apply as you&rsquo;d
                expect: only a super admin can change a super admin&rsquo;s
                role, the last active super admin can&rsquo;t be demoted, and
                demoting yourself asks you to confirm.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Change department access</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>Open the person&rsquo;s row in People.</li>
              <li>
                Under Department access, click a department to toggle it;
                Granted means they have it.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Deactivate or reactivate someone</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>Open the person&rsquo;s row and find Account status.</li>
              <li>
                Select Deactivate. Their access stops on their next request;
                their agents, connections, and history are kept.
              </li>
              <li>
                Select Reactivate to restore them. The last active super
                admin can&rsquo;t be deactivated, so an organization can
                never lock itself out.
              </li>
            </ol>
          </div>
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
        <MarketingSection title="How to">
          <p className="text-[13.5px] text-muted-foreground">
            Every lever on this page is super admin only; org admins see the
            same page read-only.
          </p>
          <div>
            <p className="font-medium text-foreground">Set the default model</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>Open Policy &amp; access and find Default model.</li>
              <li>
                Pick from the list and it saves. New agents start on it;
                existing agents and running conversations are untouched.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Bring your own provider key</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>Under Model connection, select Bring your own key.</li>
              <li>
                Paste your Anthropic API key and select Verify and save. The
                key is checked with Anthropic before it&rsquo;s stored,
                encrypted at rest, and never shown again.
              </li>
              <li>
                Switch to managed, Replace key, or Remove key from the same
                card at any time.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Set the capability ceiling and allowed categories</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                Under Allowed connections, set the most any connection can
                do: Read only, or Read and write.
              </li>
              <li>
                Toggle the categories your organization permits, from file
                storage and mail through MCP servers.
              </li>
              <li>
                Tightening takes effect immediately, including for
                connections granted earlier.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Set the research document cap</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>Under Research, set Documents per run (1 to 5000).</li>
              <li>
                Select Save. A research scope over the cap is declined before
                it runs, with the cap named.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Turn a content library on or off</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                Under Content, toggle the library, like Claude for Legal.
              </li>
              <li>
                Off hides that library&rsquo;s agents everywhere in the
                organization until you turn it back on.
              </li>
            </ol>
          </div>
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
        <MarketingSection title="How to">
          <div>
            <p className="font-medium text-foreground">Connect a system from the catalog</p>
            <p className="mt-1 text-[13.5px] text-muted-foreground">
              Super admin only; org admins see connection state read-only.
            </p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                Open Policy &amp; access and find MCP connections.
              </li>
              <li>
                Expand the provider group and select Connect on the server.
              </li>
              <li>
                Sign in with the organization&rsquo;s own account for that
                system and approve the access it asks for.
              </li>
              <li>
                legalOS discovers the server&rsquo;s tools and shows
                Connected with the tool count; Show tools lists exactly what
                agents can reach.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Connect your own server</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                Under Your own server, enter the MCP server URL. It must be
                https, and it authenticates with OAuth 2.1.
              </li>
              <li>
                Select Connect and complete the sign-in your server presents.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Disconnect or reconnect</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                Select Disconnect on a connected server; the connection and
                its stored credentials are removed.
              </li>
              <li>
                A server showing Needs reconnect has lost its grant; select
                Reconnect and sign in again.
              </li>
            </ol>
          </div>
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
        <MarketingSection title="How to">
          <p className="text-[13.5px] text-muted-foreground">
            Managing collections is super admin only; everyone else sees the
            same cards read-only.
          </p>
          <div>
            <p className="font-medium text-foreground">Create a collection</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>Open Knowledge, pick Collections, and select New collection.</li>
              <li>Name it and describe what belongs in it.</li>
              <li>
                Under Who can see it, choose Everyone in the organization or
                Specific departments; visibility is enforced at the database.
              </li>
              <li>Select Create collection. Sources come next.</li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Add a source</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                Select Add source on the collection&rsquo;s card. If the
                button isn&rsquo;t there, connect a repository like Google
                Drive in Policy &amp; access first.
              </li>
              <li>Pick the connected repository.</li>
              <li>
                Browse to the folder the collection should draw from; the
                breadcrumb shows where you are.
              </li>
              <li>
                Select Add source. The folder is referenced by its stable
                identifier, so renames and moves won&rsquo;t break it.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Sync the inventory</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>Select Sync on the collection&rsquo;s card.</li>
              <li>
                Progress shows live; large trees sync in bounded passes. The
                result is an inventory of titles and metadata, never document
                content.
              </li>
              <li>
                Re-sync whenever the repository has moved on; documents gone
                upstream are marked missing rather than silently dropped.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Edit or delete a collection</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                Edit on the card changes its name, description, and
                visibility.
              </li>
              <li>
                Delete removes the collection and its inventory only; the
                documents themselves live in your repositories and are not
                touched.
              </li>
            </ol>
          </div>
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
        <MarketingSection title="How to">
          <div>
            <p className="font-medium text-foreground">Build a workflow</p>
            <p className="mt-1 text-[13.5px] text-muted-foreground">
              Authoring is org admin and super admin; running is for everyone
              who can see the workflow.
            </p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>From My workflows, select New workflow.</li>
              <li>
                Name it, describe it, and choose its department, or Whole
                organization.
              </li>
              <li>
                Add steps in order: Run an agent, Human approval, or Take an
                action. Give agent steps a plain-language instruction; reorder
                with the arrows.
              </li>
              <li>
                Read the What this workflow does panel; it describes the
                workflow in plain language as you build.
              </li>
              <li>
                Set Status to Active when it&rsquo;s ready (drafts stay
                editable but can&rsquo;t run), then Save workflow, or Save
                and run.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Start from a template</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                Find the starter templates alongside My workflows and select
                Use this template.
              </li>
              <li>
                legalOS forks it into your own draft to adapt; templates are
                never run directly, so the starting points stay clean.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Edit or delete a workflow</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>Select Edit on the workflow&rsquo;s row to reopen the builder.</li>
              <li>
                Delete workflow lives at the bottom of the editor. Past runs
                are kept and remain viewable; each run stores its own copy of
                the steps it executed.
              </li>
            </ol>
          </div>
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
        <MarketingSection title="How to">
          <p className="text-[13.5px] text-muted-foreground">
            The task book is super admin to edit; other admins read it.
          </p>
          <div>
            <p className="font-medium text-foreground">Map a task to an agent</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                Open the Productivity Calculator and find Task types.
              </li>
              <li>
                Select Add task type and name the task, like reviewing an
                inbound NDA.
              </li>
              <li>
                Pick the agent that does it; its run volume becomes Measured
                from the last 12 months of real usage. No agent yet? Choose
                Manual estimate instead, labeled honestly as one.
              </li>
              <li>Set the time saved per run; that part is your estimate.</li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Set the team and salaries</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                Under Team, select Add team member and enter a name or role
                and an annual salary.
              </li>
              <li>
                Salaries set the blended hourly rate and the seat count;
                they&rsquo;re estimates and labeled as such.
              </li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-foreground">Read the result honestly</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                Every figure carries a Measured or Estimate badge: run volume
                is measured, time saved and rates are yours.
              </li>
              <li>
                Select Save changes; the same task book powers each
                person&rsquo;s home Impact card. Create report exports the
                summary.
              </li>
            </ol>
          </div>
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
        <MarketingSection title="How to">
          <div>
            <p className="font-medium text-foreground">Read the log</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                Open Audit log in the admin area; entries read newest first,
                each a plain sentence with the actor, the person affected,
                and the time.
              </li>
              <li>Select Load more to page further back.</li>
              <li>
                An entry by The system marked as a direct change was made
                outside the product, stated honestly rather than dressed up
                as a person&rsquo;s action. The log is read-only by design.
              </li>
            </ol>
          </div>
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
