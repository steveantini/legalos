"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";

import { formatHours, formatUSD, parseHours } from "./math";

export interface Task {
  id: string;
  name: string;
  tasksPerYear: string;
  timeWithout: string;
  timeWith: string;
}

interface TaskRowProps {
  task: Task;
  hourlyRate: number;
  onChange: (patch: Partial<Omit<Task, "id">>) => void;
  onDelete: () => void;
}

export function TaskRow({ task, hourlyRate, onChange, onDelete }: TaskRowProps) {
  const timeWithout = parseHours(task.timeWithout);
  const timeWith = parseHours(task.timeWith);
  const hoursSaved = Math.max(timeWithout - timeWith, 0);
  const savings = hoursSaved * hourlyRate;

  return (
    <TableRow>
      <TableCell>
        <input
          type="text"
          aria-label="Task description"
          placeholder="e.g., Review Enterprise Agreement"
          value={task.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </TableCell>
      <TableCell className="text-right">
        <input
          type="number"
          min={0}
          aria-label="Tasks per year"
          value={task.tasksPerYear}
          onChange={(e) => onChange({ tasksPerYear: e.target.value })}
          className="w-20 rounded-md border border-input bg-background px-2 py-1 text-right text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </TableCell>
      <TableCell className="text-right">
        <input
          type="number"
          min={0}
          step="0.1"
          aria-label="Annual time without agent (hours)"
          value={task.timeWithout}
          onChange={(e) => onChange({ timeWithout: e.target.value })}
          className="w-24 rounded-md border border-input bg-background px-2 py-1 text-right text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </TableCell>
      <TableCell className="text-right">
        <input
          type="number"
          min={0}
          step="0.1"
          aria-label="Annual time with agent (hours)"
          value={task.timeWith}
          onChange={(e) => onChange({ timeWith: e.target.value })}
          className="w-24 rounded-md border border-input bg-background px-2 py-1 text-right text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatHours(hoursSaved)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatUSD(savings)}
      </TableCell>
      <TableCell className="text-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Delete task"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
