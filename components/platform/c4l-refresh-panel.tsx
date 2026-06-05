"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { refreshC4LContent } from "@/lib/actions/c4l-content";
import type {
  C4LRefreshResult,
  C4LRefreshSummary,
} from "@/lib/content/c4l-fetch";

/**
 * The platform-owner "Refresh from source" control + result report (C4L/platform
 * arc, Step 3). Calls the platform-owner-gated `refreshC4LContent` action, which
 * fetches the public C4L repo and runs the safe insert-new-only import, then
 * reports what happened: new agents added, filtered content protected, and any
 * upstream plugins we don't map or content updates available — surfaced for
 * review, never applied automatically.
 *
 * Calm register, matching the platform/admin surface. Running it again when
 * nothing is new reads as "up to date" (the import is insert-new-only).
 */
export function C4LRefreshPanel() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<C4LRefreshResult | null>(null);

  async function onRefresh() {
    setLoading(true);
    setResult(null);
    try {
      setResult(await refreshC4LContent());
    } catch {
      setResult({
        ok: false,
        error: "Something went wrong. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button type="button" onClick={onRefresh} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh from source"}
        </Button>
        {loading ? (
          <span className="text-[13px] text-muted-foreground">
            Reading the source repository…
          </span>
        ) : null}
      </div>

      {result ? <RefreshResultView result={result} /> : null}
    </div>
  );
}

function RefreshResultView({ result }: { result: C4LRefreshResult }) {
  if (!result.ok) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-warn-fg/30 bg-paper-2 px-4 py-3 text-[13px] leading-[1.5] text-warn-fg"
      >
        {result.error}
      </p>
    );
  }
  return <RefreshSummaryView summary={result.summary} />;
}

function RefreshSummaryView({ summary }: { summary: C4LRefreshSummary }) {
  const {
    insertedCount,
    insertedDepartments,
    skippedFilteredCount,
    unmappedPlugins,
    updatesAvailableCount,
    unchangedCount,
  } = summary;

  const nothingNew =
    insertedCount === 0 &&
    unmappedPlugins.length === 0 &&
    updatesAvailableCount === 0;

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-xl border border-hairline bg-paper-2 px-5 py-4"
    >
      <p className="text-[14px] font-medium text-foreground">
        {insertedCount > 0
          ? `Added ${insertedCount} new ${insertedCount === 1 ? "agent" : "agents"}.`
          : nothingNew
            ? "No new content. Your library is up to date."
            : "No new agents to add."}
      </p>

      <ul className="flex flex-col gap-1.5 text-[13px] leading-[1.5] text-muted-foreground">
        {insertedCount > 0 && insertedDepartments.length > 0 ? (
          <li>Placed in: {insertedDepartments.join(", ")}.</li>
        ) : null}

        {skippedFilteredCount > 0 ? (
          <li>
            {skippedFilteredCount}{" "}
            {skippedFilteredCount === 1 ? "skill" : "skills"} you had filtered
            out stayed filtered, untouched.
          </li>
        ) : null}

        {unchangedCount > 0 ? (
          <li>
            {unchangedCount} existing{" "}
            {unchangedCount === 1 ? "agent was" : "agents were"} already up to
            date.
          </li>
        ) : null}

        {updatesAvailableCount > 0 ? (
          <li className="text-foreground">
            {updatesAvailableCount}{" "}
            {updatesAvailableCount === 1 ? "agent has" : "agents have"} an
            updated version upstream. Existing agents are never overwritten, so
            these are listed for review, not applied.
          </li>
        ) : null}

        {unmappedPlugins.length > 0 ? (
          <li className="text-foreground">
            {unmappedPlugins.length} upstream{" "}
            {unmappedPlugins.length === 1 ? "plugin is" : "plugins are"} not
            mapped to a department and {unmappedPlugins.length === 1 ? "was" : "were"}{" "}
            not imported: {unmappedPlugins.join(", ")}.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
