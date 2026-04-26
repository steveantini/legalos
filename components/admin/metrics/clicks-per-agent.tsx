"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ClicksRow, Period } from "@/lib/metrics/types";

import {
  buildClicksByAgentCsv,
  clicksByAgentFilename,
  triggerDownload,
} from "./csv";
import type { DataSourceMode } from "./data-source-toggle";

interface ClicksPerAgentProps {
  rowsFor: (period: Period) => ClicksRow[];
  onAgentClick: (agentName: string) => void;
  mode: DataSourceMode;
}

const REAL_MODE_EMPTY_COPY =
  "No agent activity recorded yet. Click an agent on a department launchpad to start tracking events.";
const SAMPLE_MODE_EMPTY_COPY =
  "No agent activity recorded for this period.";

/**
 * Clicks per Agent panel — mirrors source admin.html lines 1026–1112.
 * - Header: <h3> + week/month/year period select (default 'week').
 * - Bar chart: one row per agent, width = (value / max) * 100% (matches
 *   the source's `(item.value / maxValue * 100).toFixed(0)` formula).
 *   Solid bars per Constraint B (the source uses a brand-specific
 *   gradient that we don't port).
 * - Clickable agent labels open the Agent Detail Modal.
 * - Footer: instruction text + Create Report CSV button.
 *
 * Disabled Create Report button when empty (Q5 of the Session 6 plan).
 */
export function ClicksPerAgent({ rowsFor, onAgentClick, mode }: ClicksPerAgentProps) {
  const [period, setPeriod] = useState<Period>("week");
  const rows = rowsFor(period);
  const empty = rows.length === 0;
  const emptyCopy = mode === "real" ? REAL_MODE_EMPTY_COPY : SAMPLE_MODE_EMPTY_COPY;
  const maxValue = empty ? 1 : Math.max(...rows.map((r) => r.value));

  function handleExport() {
    if (empty) return;
    const csv = buildClicksByAgentCsv(rows, period, mode);
    triggerDownload(csv, clicksByAgentFilename(period, mode));
  }

  return (
    <section aria-labelledby="clicks-per-agent-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h3 id="clicks-per-agent-heading" className="text-lg font-semibold">
          Clicks per Agent
        </h3>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-40" aria-label="Clicks per Agent time period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Last Week</SelectItem>
            <SelectItem value="month">Last Month</SelectItem>
            <SelectItem value="year">Last Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div role="list" aria-label="Clicks per agent bar chart" className="space-y-2">
        {empty ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {emptyCopy}
          </p>
        ) : (
          rows.map((row) => {
            const pct = Math.round((row.value / maxValue) * 100);
            return (
              <div
                key={row.label}
                role="listitem"
                className="grid grid-cols-[1fr_3fr_auto] items-center gap-3"
              >
                <div className="truncate text-sm">
                  <button
                    type="button"
                    onClick={() => onAgentClick(row.label)}
                    className="text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {row.label}
                  </button>
                </div>
                <div
                  className="h-3 w-full rounded-sm bg-muted"
                  role="img"
                  aria-label={`${row.value.toLocaleString()} clicks`}
                >
                  <div
                    className="h-full rounded-sm bg-primary"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-right text-sm tabular-nums">
                  {row.value.toLocaleString()}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
        <p className="text-xs text-muted-foreground">
          Click on an agent name to view usage details
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={empty}
          aria-label={empty ? "Create Report — no data to export" : "Create Report"}
          onClick={handleExport}
        >
          Create Report
        </Button>
      </div>
    </section>
  );
}
