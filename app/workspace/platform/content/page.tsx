import type { Metadata } from "next";

import { C4LRefreshPanel } from "@/components/platform/c4l-refresh-panel";
import { VENDOR_CONTENT_PROVIDERS } from "@/lib/content/vendor-registry";
import { SECTION_CONTENT_MAX_WIDTH } from "@/lib/workspace/layout";

export const metadata: Metadata = {
  title: "Content library",
};

/**
 * Platform-admin Content library (C4L/platform arc, Step 3). Lists the vendor
 * content providers legalOS ships (Claude for Legal today) and gives the
 * platform owner a one-button refresh from each provider's public source.
 *
 * Gated by the platform layout's `requirePlatformOwner()` — a non-platform-owner,
 * including an org super_admin, cannot reach this page. The refresh action is
 * independently platform-owner-gated. The refresh is safe and conservative
 * (insert-new-only; never resurrects filtered content; never overwrites existing
 * agents): the panel reports what happened and surfaces decisions rather than
 * making them. The width + register match the org admin surface one tier up.
 */
export default function PlatformContentPage() {
  const providers = Object.values(VENDOR_CONTENT_PROVIDERS);

  return (
    <main className={`w-full ${SECTION_CONTENT_MAX_WIDTH}`}>
      <header>
        <h1 className="text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          Content library
        </h1>
        <p className="mt-[14px] max-w-[60ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          The curated agent libraries legalOS ships into departments. Refresh a
          library from its public source to pull new agents, without re-coding
          each update.
        </p>
      </header>

      <div className="mt-10 flex flex-col gap-6">
        {providers.map((provider) => (
          <section
            key={provider.providerId}
            aria-label={provider.displayLabel}
            className="rounded-xl border border-border bg-card p-6"
          >
            <h2 className="text-[17px] font-medium text-foreground">
              {provider.displayLabel}
            </h2>
            <p className="mt-1 text-[13px] leading-[1.5] text-muted-foreground">
              Source:{" "}
              <a
                href={provider.sourceRepo}
                target="_blank"
                rel="noreferrer noopener"
                className="text-primary hover:underline"
              >
                {provider.sourceRepo.replace(/^https:\/\//, "")}
              </a>
            </p>
            <p className="mt-1 text-[13px] leading-[1.5] text-caption">
              {Object.keys(provider.pluginDepartmentMap).length} mapped{" "}
              {Object.keys(provider.pluginDepartmentMap).length === 1
                ? "plugin"
                : "plugins"}
              . New agents land in their mapped department; filtered content stays
              filtered.
            </p>

            <div className="mt-5">
              <C4LRefreshPanel />
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
