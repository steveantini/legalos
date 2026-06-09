import { type MetricValue, formatMetric } from "@/lib/platform/metrics/format";
import type { MetricColumn } from "@/lib/platform/metrics/registry";

import { MetricSkeletonBlock, MetricTileMessage } from "./metric-tile";

/**
 * MetricTable — the declarative table primitive (analytics arc, Step 1), and the
 * vessel for the centerpiece adoption/engagement-health hero.
 *
 * Columns are pure data (key + label + FormatToken, an optional muted `sub`
 * field, an optional `signal`). Two columns get expressive treatment so a
 * drifting customer is legible without being alarmist:
 *
 *   - `sub`: a muted secondary value under the primary (e.g. "4 / 6" under an
 *     activation rate), read from another row field — still just data.
 *   - `signal: "recency"`: the calm at-risk signal. The tile precomputes a
 *     `recency_state` per row ("active" | "quiet" | "none"); a customer that has
 *     gone quiet (had activity, none in the window) reads in the warn token,
 *     text only, no fill — attention, not alarm. A never-started customer reads
 *     neutral, not warned.
 *
 * Rows carry whatever fields the columns name (the tile shapes them); the table
 * stays generic and reusable for any flat metric table (Step 2's cost tables).
 */

type Row = Record<string, MetricValue>;

export function MetricTable({
  columns,
  rows,
  emptyLabel,
}: {
  columns: MetricColumn[];
  rows: Row[];
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <MetricTileMessage>{emptyLabel}</MetricTileMessage>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-hairline-strong">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`pb-2.5 font-medium text-caption ${
                  col.align === "end" ? "text-right" : "text-left"
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={String(row.organization_id ?? i)}
              className="border-b border-hairline last:border-0"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`py-3 align-top ${
                    col.align === "end" ? "text-right" : "text-left"
                  }`}
                >
                  <Cell col={col} row={row} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ col, row }: { col: MetricColumn; row: Row }) {
  if (col.signal === "recency") return <RecencyCell col={col} row={row} />;

  const numeric = col.align === "end" ? "tabular-nums" : "";
  return (
    <div>
      <div className={`text-foreground ${numeric}`}>
        {formatMetric(row[col.key] ?? null, col.format)}
      </div>
      {col.sub ? (
        <div className={`text-[11px] text-caption ${numeric}`}>
          {formatMetric(row[col.sub.key] ?? null, col.sub.format)}
        </div>
      ) : null}
    </div>
  );
}

/** The calm recency / at-risk cell. Tone comes from the precomputed state. */
function RecencyCell({ col, row }: { col: MetricColumn; row: Row }) {
  const state = row.recency_state;

  if (state === "none") {
    return <div className="text-[11px] text-caption">No activity yet</div>;
  }

  const label = formatMetric(row[col.key] ?? null, col.format);

  if (state === "quiet") {
    return (
      <div>
        <div className="text-warn-fg tabular-nums">{label}</div>
        <div className="text-[11px] text-warn-fg">Quiet</div>
      </div>
    );
  }

  return <div className="text-muted-foreground tabular-nums">{label}</div>;
}

/** Matching skeleton: a header rule plus a few shimmer rows. */
export function MetricTableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div>
      <MetricSkeletonBlock className="h-3 w-full" />
      <div className="mt-4 flex flex-col gap-4">
        {Array.from({ length: rows }).map((_, i) => (
          <MetricSkeletonBlock key={i} className="h-5 w-full" />
        ))}
      </div>
    </div>
  );
}
