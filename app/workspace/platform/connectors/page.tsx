import type { Metadata } from "next";

import {
  listConnectorCatalogByCategory,
  type ConnectorCatalogEntry,
} from "@/lib/connections/providers/mcp-registry";
import { practiceAreasSummary } from "@/lib/connections/providers/c4l-connector-catalog";
import { captionLabel } from "@/lib/workspace/rail-styles";

export const metadata: Metadata = {
  title: "Connectors",
};

/**
 * Platform-admin Connectors page (connector catalog arc) — the platform
 * owner's view of the trusted-registry catalog: every pre-vetted connector,
 * its honest verification status, provenance (down to the upstream commit it
 * was harvested from), auth model, endpoint, and the practice areas it ships
 * in. Read-only by design: the catalog is version-controlled code (the
 * trusted-only hard ceiling, D-089), so it changes by a reviewed deploy, not
 * a form. Organizations enable entries themselves through the governed
 * connect flow in Policy & access; nothing here connects anything.
 *
 * Gated by the platform layout's `requirePlatformOwner()`; the layout owns
 * the 896px left-justified <main>, so this renders a fragment inside it.
 */
export default function PlatformConnectorsPage() {
  const categories = listConnectorCatalogByCategory();
  const entries = categories.flatMap((category) => category.entries);
  const verifiedCount = entries.filter((e) => e.status === "verified").length;

  return (
    <>
      <header>
        <h1 className="text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          Connectors
        </h1>
        <p className="mt-[14px] max-w-[60ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          The pre-vetted catalog of systems organizations can connect. Every
          entry is a trusted-registry member, disabled until an organization
          connects it with its own credentials.
        </p>
        <p className="mt-3 max-w-[60ch] text-[13px] leading-[1.5] text-caption">
          {entries.length} connectors, {verifiedCount} verified live. Verified
          means legalOS proved the full path: connect, tool discovery, and a
          real agent read. Available means pre-seeded from a vetted source and
          not yet live-verified.
        </p>
      </header>

      <div className="mt-10 flex flex-col gap-10">
        {categories.map((category) => (
          <section
            key={category.key}
            aria-labelledby={`connectors-${category.key}`}
          >
            <h2
              id={`connectors-${category.key}`}
              className={`${captionLabel} mb-1`}
            >
              {category.label}
            </h2>
            <p className="text-[13px] leading-[1.5] text-muted-foreground">
              {category.descriptor}
            </p>

            <div className="mt-3">
              {category.entries.map((entry) => (
                <div
                  key={entry.serverId}
                  className="border-b border-hairline last:border-b-0"
                >
                  <ConnectorRow entry={entry} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

/** The status pill: verified stands forward, available stays quiet. */
function StatusPill({ status }: { status: ConnectorCatalogEntry["status"] }) {
  if (status === "verified") {
    return (
      <span className="shrink-0 rounded-full border border-hairline-strong bg-background px-2 py-0.5 text-[11px] font-medium text-foreground">
        Verified live
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full border border-hairline bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      Available
    </span>
  );
}

/** Friendly label for an entry's auth model. */
const AUTH_MODEL_LABELS: Record<ConnectorCatalogEntry["authModel"], string> = {
  oauth: "OAuth 2.1",
  "api-key": "API key",
  none: "No authentication",
};

/** One catalog entry in the filled-row register. */
function ConnectorRow({ entry }: { entry: ConnectorCatalogEntry }) {
  const practiceAreas =
    entry.provenance.plugins.length > 0
      ? practiceAreasSummary(entry.provenance.plugins)
      : null;

  return (
    <div className="rounded-lg bg-paper-2 px-5 py-3">
      <div className="flex items-center gap-2">
        <p className="text-[14.5px] font-medium text-foreground">
          {entry.displayName}
        </p>
        <StatusPill status={entry.status} />
      </div>

      <p className="mt-1 max-w-[70ch] text-[13px] leading-[1.5] text-muted-foreground">
        {entry.description} {entry.accessNote}
      </p>

      <p className="mt-1.5 break-all font-mono text-[11.5px] text-caption">
        {entry.endpoint}
      </p>

      <p className="mt-1 text-[12px] leading-[1.5] text-caption">
        {AUTH_MODEL_LABELS[entry.authModel]} · Source:{" "}
        <a
          href={entry.provenance.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="underline decoration-hairline-strong underline-offset-2 transition-colors duration-release ease-release hover:text-foreground hover:duration-hover motion-reduce:transition-none"
        >
          {entry.provenance.sourceLabel}
        </a>
        {entry.provenance.commit ? (
          <>
            {" "}
            at <span className="font-mono">{entry.provenance.commit.slice(0, 7)}</span>
          </>
        ) : null}
        {practiceAreas ? <> · Ships in: {practiceAreas}</> : null}
      </p>
    </div>
  );
}
