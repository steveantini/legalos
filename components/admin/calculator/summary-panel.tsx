"use client";

import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  formatHoursInteger,
  formatRoiPercent,
  formatUSD,
  formatUSDInteger,
} from "./math";
import type { InfoTopic } from "./info-modal";

interface SummaryPanelProps {
  totalHours: number;
  totalSavings: number;
  agentCost: number;
  roi: number;
  costLabel: string;
  onInfoOpen: (topic: InfoTopic) => void;
  onExport: () => void;
}

export function SummaryPanel({
  totalHours,
  totalSavings,
  agentCost,
  roi,
  costLabel,
  onInfoOpen,
  onExport,
}: SummaryPanelProps) {
  const roiClass =
    roi >= 0 ? "text-green-600" : "text-red-600";

  return (
    <section
      aria-label="Overall Productivity Gains"
      className="space-y-4"
    >
      <div className="rounded-lg bg-muted/40 p-6">
        <h3 className="mb-4 text-center text-lg font-semibold">
          Overall Productivity Gains
        </h3>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="flex flex-col items-center gap-2">
            <div className="flex flex-col items-center">
              <div className="text-sm text-muted-foreground">
                Total Hours Saved
              </div>
              <div className="text-3xl font-semibold tabular-nums">
                {formatHoursInteger(totalHours)}
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span>{costLabel}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`More info: ${costLabel.toLowerCase()}`}
                onClick={() => onInfoOpen("agent-cost")}
                className="size-6"
              >
                <Info className="size-4" />
              </Button>
              <span className="font-medium tabular-nums text-foreground">
                {formatUSDInteger(agentCost)}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="flex flex-col items-center">
              <div className="text-sm text-muted-foreground">Total Savings</div>
              <div className="text-3xl font-semibold tabular-nums">
                {formatUSD(totalSavings)}
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span>Total ROI</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="More info: total ROI"
                onClick={() => onInfoOpen("total-roi")}
                className="size-6"
              >
                <Info className="size-4" />
              </Button>
              <span className={`font-medium tabular-nums ${roiClass}`}>
                {formatRoiPercent(roi)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={onExport}>
          Create Report
        </Button>
      </div>
    </section>
  );
}
