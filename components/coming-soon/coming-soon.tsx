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
  "knowledge-research": {
    label: "Research",
    copy: "Ask a legal question; get a citation-backed answer drawing from three sources: your firm's internal corpus, the open web, and trusted legal content partnerships. The same research capability your agents call as a tool. Arrives with the Knowledge reshape.",
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

/**
 * Centered "Coming soon" template used by every sub-leaf placeholder
 * surface. Renders a mono-caps area label (optional), the "Coming
 * soon." h1, a descriptive paragraph, and a back-to-workspace link.
 *
 * Two consumers:
 *   - `<ComingSoon area>` (below) — looks up `AREA_COPY` by slug and
 *     delegates here. Powers the dynamic `/workspace/coming-soon/[area]`
 *     route.
 *   - Leaf placeholder pages (`/workspace/workflows/my-workflows`,
 *     `/workspace/integrations/connections`, `/workspace/help/guides`,
 *     future siblings) — import `ComingSoonContent` directly and pass
 *     their own `label` + `description`. URL stays stable across the
 *     real → coming-soon → real rebuild cycle; only the body swaps in.
 *     (The top-level `/workspace/<group>` routes are now group landings
 *     with a card grid — a separate pattern; see `coming-soon-card.tsx`.)
 *
 * `label` is optional: when absent (the unrecognized-slug fallback in
 * `ComingSoon`), the mono-caps header is omitted and only the h1 +
 * description + back link render.
 */
export function ComingSoonContent({
  label,
  description,
}: {
  label?: string;
  description: string;
}) {
  return (
    <main className="mx-auto flex min-h-0 max-w-2xl flex-1 flex-col items-center justify-center text-center">
      {label ? (
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-caption">
          {label}
        </p>
      ) : null}

      <h1 className="mt-3 text-4xl font-medium tracking-tight text-foreground">
        Coming soon.
      </h1>

      <p className="mt-6 max-w-prose text-base leading-relaxed text-muted-foreground">
        {description}
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

export function ComingSoon({ area }: { area?: string }) {
  const recognized = area ? AREA_COPY[area] : undefined;

  return (
    <ComingSoonContent
      label={recognized?.label}
      description={recognized ? recognized.copy : GENERIC_COPY}
    />
  );
}
