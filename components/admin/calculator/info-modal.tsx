"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type InfoTopic =
  | "hourly-rate"
  | "total-roi"
  | "agent-cost"
  | "methodology";

interface InfoModalProps {
  topic: InfoTopic | null;
  costLabel: string;
  costDescription: string;
  onOpenChange: (open: boolean) => void;
}

const STATIC_CONTENT: Record<
  Exclude<InfoTopic, "agent-cost">,
  { title: string; body: string }
> = {
  "hourly-rate": {
    title: "Blended hourly rate",
    body: "An estimate of the true cost of an employee per hour, averaged across your team. Formula: (annual salary / 2080) * 1.3, averaged over the team members you enter. Salaries are your estimates.",
  },
  "total-roi": {
    title: "Total ROI",
    body: "The overall return on investment. Formula: ((total savings - annual cost) / annual cost) * 100%. Because savings blend measured usage with your estimates, the ROI is an informed estimate, not a fully measured figure.",
  },
  methodology: {
    title: "How this is calculated",
    body: "Run volumes are measured from your organization's actual usage over the last 12 months (the agent runs recorded as you use the product). Salary and the time saved per run are your estimates. Each task's annual hours saved = (your estimated minutes saved per run / 60) * the measured runs per year; savings = hours saved * the blended fully-loaded hourly rate; platform cost = team size * your cost per user; ROI = (savings - cost) / cost. The resulting hours, cost, and ROI therefore blend measured activity with your assumptions: the volume is real, the time saved and rates are estimates.",
  },
};

export function InfoModal({
  topic,
  costLabel,
  costDescription,
  onOpenChange,
}: InfoModalProps) {
  const content =
    topic === "agent-cost"
      ? {
          title: costLabel,
          body: `${costDescription} This is your estimate. The total cost is this value times the number of team members entered.`,
        }
      : topic
        ? STATIC_CONTENT[topic]
        : null;

  return (
    <Dialog open={topic !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{content?.title ?? ""}</DialogTitle>
          <DialogDescription>{content?.body ?? ""}</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
