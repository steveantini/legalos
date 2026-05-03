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
};

const GENERIC_COPY = "We're building this part of the app. Check back soon.";

export function ComingSoon({ area }: { area?: string }) {
  const recognized = area ? AREA_COPY[area] : undefined;

  return (
    <main className="mx-auto flex min-h-0 max-w-2xl flex-1 flex-col items-center justify-center px-6 py-12 text-center">
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
        href="/"
        className="mt-10 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        ← Back to workspace
      </Link>
    </main>
  );
}
