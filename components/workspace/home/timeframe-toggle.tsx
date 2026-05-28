"use client";

import type { Timeframe } from "@/lib/workspace/home/impact-math";

type TimeframeToggleProps = {
  selected: Timeframe;
  onChange: (timeframe: Timeframe) => void;
};

const OPTIONS: { value: Timeframe; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "ytd", label: "YTD" },
];

/**
 * Segmented control for the impact band's timeframe (Week / Month / YTD).
 *
 * This is a toggle-button group, not a tab list: the buttons swap which data
 * fills a single visible region (the stats grid) rather than revealing
 * distinct panels, so each is a plain <button> with `aria-pressed` conveying
 * its toggled state, wrapped in a `role="group"` that names the cluster.
 * Native Tab moves between buttons and Enter/Space activates them — the
 * toggle-button pattern expects no arrow-key roving, so none is wired. A
 * screen reader announces "Week, button, pressed" / "Month, button, not
 * pressed", which describes the control honestly.
 */
export function TimeframeToggle({ selected, onChange }: TimeframeToggleProps) {
  return (
    <div
      role="group"
      aria-label="Impact timeframe"
      className="inline-flex items-center rounded-full border border-border bg-card p-0.5"
    >
      {OPTIONS.map((option) => {
        const isSelected = option.value === selected;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(option.value)}
            className={`rounded-full px-3.5 py-1 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              isSelected
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
