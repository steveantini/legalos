"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type InfoTopic = "hourly-rate" | "total-roi" | "agent-cost";

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
    title: "Fully Loaded Hourly Rate",
    body: "An estimate of the true cost of an employee per hour. Formula: (Annual Salary / 2080) * 1.3",
  },
  "total-roi": {
    title: "Total ROI Calculation",
    body: "The overall Return on Investment for the tool. Formula: ((Total Savings - Annual Cost) / Annual Cost) * 100%",
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
          body: `${costDescription} Cost is automatically calculated based on the number of team members entered.`,
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
