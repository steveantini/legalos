import type { AutonomyLevel } from "@/lib/workflows/types";

/**
 * The two autonomy choices, explained plainly — shared by the run form (per-run
 * autonomy, Step 3) and the watcher adopt flow (per-schedule autonomy applied to
 * every spawned run, Stage 3a D-224). One source so the honest v1 contract
 * ("even an autonomous run still pauses for approval before any write") is
 * worded identically everywhere it is offered.
 */
export const AUTONOMY_CHOICES: Array<{
  value: AutonomyLevel;
  title: string;
  description: string;
}> = [
  {
    value: "supervised",
    title: "Supervised",
    description:
      "You approve along the way. The run pauses at every human checkpoint and before any action that changes a connected system.",
  },
  {
    value: "autonomous",
    title: "Autonomous",
    description:
      "Runs on its own. Checkpoints clear automatically, but the run still pauses for your approval before any action that changes a connected system.",
  },
];
