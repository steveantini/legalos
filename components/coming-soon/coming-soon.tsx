import Link from "next/link";

type AreaCopy = {
  label: string;
  copy: string;
};

const AREA_COPY: Record<string, AreaCopy> = {
  knowledge: {
    label: "Knowledge",
    copy: "A searchable home for your team's playbooks, precedent, and reference materials. Currently in development.",
  },
  "knowledge-vault": {
    label: "Vault",
    copy: "Your firm's internal documents, precedents, and memos — the curated corpus your assistant and agents draw from when answering questions. Arrives with the Knowledge reshape.",
  },
  "knowledge-sources": {
    label: "Sources",
    copy: "Admin configuration for content partnerships (EDGAR, Westlaw, regional case law) and how the open web is searched. Arrives with the Knowledge reshape.",
  },
  matters: {
    label: "Matters & Deals",
    copy: "Track every active matter and deal in one place. Currently in development.",
  },
  inbox: {
    label: "Inbox",
    copy: "Centralized notifications and approvals from across your workspace. Currently in development.",
  },
  resources: {
    label: "Resources",
    copy: "Templates, guides, and operational resources for your legal team. Currently in development.",
  },
  "workflows-templates": {
    label: "Template Library",
    copy: "Pre-built workflows for common legal tasks — contract review, supplier diligence, case timeline extraction. Fork a template, customize it, run it across your matters. Arrives with the Workflows build.",
  },
  "integrations-marketplace": {
    label: "Marketplace",
    copy: "Browse available integrations to install — contract lifecycle managers, document management systems, matter management, calendar, email. Configure once at the admin level; agents pick up the connection automatically. Arrives with the Integrations build.",
  },
  "help-whats-new": {
    label: "What’s New",
    copy: "Recent feature shipments, improvements, and product updates. Arrives with the Help build.",
  },
};

const GENERIC_COPY = "We're building this part of the app. Check back soon.";

export function ComingSoon({ area }: { area?: string }) {
  const recognized = area ? AREA_COPY[area] : undefined;

  return (
    <main className="mx-auto flex min-h-0 max-w-2xl flex-1 flex-col items-center justify-center text-center">
      {recognized ? (
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-caption">
          {recognized.label}
        </p>
      ) : null}

      <h1 className="mt-3 text-4xl font-medium tracking-tight text-foreground">
        Coming soon.
      </h1>

      <p className="mt-6 max-w-prose text-base leading-relaxed text-muted-foreground">
        {recognized ? recognized.copy : GENERIC_COPY}
      </p>

      <Link
        href="/workspace"
        className="mt-10 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        ← Back to workspace
      </Link>
    </main>
  );
}
