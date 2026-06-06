import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/workflows/run-view";

/**
 * The shared dot-plus-label status pill for the run surfaces (run view, step
 * timeline, run-history list) — the same quiet register as the My Workflows
 * status pill. Server-renderable; the in-motion pulse honors reduced motion.
 */

const TONE_DOT: Record<StatusTone, string> = {
  positive: "bg-emerald-500",
  attention: "bg-amber-500",
  negative: "bg-destructive",
  neutral: "bg-muted-foreground/40",
};

export function StatusDotPill({
  label,
  tone,
  pulse = false,
  className,
}: {
  label: string;
  tone: StatusTone;
  /** True for in-motion statuses (running / awaiting approval). */
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[12px] text-muted-foreground",
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          TONE_DOT[tone],
          pulse && "animate-pulse motion-reduce:animate-none",
        )}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
