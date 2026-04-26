import { ArrowDown, ArrowUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { TrendPill } from "@/lib/metrics/types";

interface MetricCardProps {
  label: string;
  /** Number to display, or null to show an em-dash placeholder. */
  value: number | null;
  /** Optional trend pill; null in real mode (no trend pill rendered). */
  trend: TrendPill | null;
}

const NUM = new Intl.NumberFormat("en-US");

/**
 * One KPI card in the metrics grid. Mirrors the source's
 * `<div class="metric-card">` layout (admin.html lines 941–965):
 * large value, small label, optional trend pill below.
 *
 * - `value === null` renders as "—" (real mode for user-dependent cards).
 * - `trend === null` renders no trend pill (real mode for all cards;
 *   sample mode populates per the source's hardcoded values).
 */
export function MetricCard({ label, value, trend }: MetricCardProps) {
  const valueText = value === null ? "—" : NUM.format(value);
  const trendClass =
    trend?.direction === "up" ? "text-green-600" : "text-red-600";
  const TrendIcon = trend?.direction === "up" ? ArrowUp : ArrowDown;

  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-6">
        <div className="text-3xl font-semibold tabular-nums">{valueText}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
        {trend ? (
          <div className={`mt-1 flex items-center gap-1 text-xs ${trendClass}`}>
            <TrendIcon className="size-3" aria-hidden="true" />
            <span>
              {trend.pct}% {trend.compare}
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
