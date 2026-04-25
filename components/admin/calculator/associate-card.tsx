"use client";

import { Info, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from "@/components/ui/table";

import {
  formatHours,
  formatTasksInteger,
  formatUSD,
  hourlyRateFromSalary,
  hoursSaved as calcHoursSaved,
  parseHours,
  parseSalary,
  parseTasks,
  rowSavings,
} from "./math";
import { TaskRow, type Task } from "./task-row";
import type { InfoTopic } from "./info-modal";

export interface Associate {
  id: string;
  name: string;
  salary: string;
  tasks: Task[];
}

interface AssociateCardProps {
  associate: Associate;
  index: number;
  onChange: (patch: Partial<Omit<Associate, "id" | "tasks">>) => void;
  onTaskChange: (taskId: string, patch: Partial<Omit<Task, "id">>) => void;
  onAddTask: () => void;
  onDeleteTask: (taskId: string) => void;
  onRemove: () => void;
  onInfoOpen: (topic: InfoTopic) => void;
}

export function AssociateCard({
  associate,
  index,
  onChange,
  onTaskChange,
  onAddTask,
  onDeleteTask,
  onRemove,
  onInfoOpen,
}: AssociateCardProps) {
  const salary = parseSalary(associate.salary);
  const hourlyRate = hourlyRateFromSalary(salary);

  const totals = associate.tasks.reduce(
    (acc, t) => {
      const tasksPerYear = parseTasks(t.tasksPerYear);
      const timeWithout = parseHours(t.timeWithout);
      const timeWith = parseHours(t.timeWith);
      const saved = calcHoursSaved(timeWithout, timeWith);
      acc.tasks += tasksPerYear;
      acc.timeWithout += timeWithout;
      acc.timeWith += timeWith;
      acc.hoursSaved += saved;
      acc.savings += rowSavings(saved, hourlyRate);
      return acc;
    },
    { tasks: 0, timeWithout: 0, timeWith: 0, hoursSaved: 0, savings: 0 },
  );

  const removeLabel = associate.name
    ? `Remove team member ${associate.name}`
    : `Remove team member ${index + 1}`;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <input
              type="text"
              aria-label="Team member name"
              placeholder="Team Member Name"
              value={associate.name}
              onChange={(e) => onChange({ name: e.target.value })}
              className="w-48 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />

            <div className="flex items-center">
              <span className="mr-2 text-sm text-muted-foreground">$</span>
              <input
                type="number"
                min={0}
                aria-label="Annual salary"
                placeholder="Annual Salary"
                value={associate.salary}
                onChange={(e) => onChange({ salary: e.target.value })}
                className="w-40 rounded-md border border-input bg-background px-3 py-2 text-right text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
              <span>
                Hourly Rate:{" "}
                <span className="font-semibold tabular-nums">
                  {formatUSD(hourlyRate)}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="More info: hourly rate"
                onClick={() => onInfoOpen("hourly-rate")}
                className="size-6 text-muted-foreground hover:text-foreground"
              >
                <Info className="size-4" />
              </Button>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={removeLabel}
            onClick={onRemove}
          >
            Remove
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-left">Task Description</TableHead>
                <TableHead className="text-right">Tasks/Year</TableHead>
                <TableHead className="text-right">
                  Annual Time w/o Agent (Hours)
                </TableHead>
                <TableHead className="text-right">
                  Annual Time w/ Agent (Hours)
                </TableHead>
                <TableHead className="text-right">Annual Hours Saved</TableHead>
                <TableHead className="text-right">Annual Savings ($)</TableHead>
                <TableHead className="w-12 text-center" aria-label="Delete" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {associate.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  hourlyRate={hourlyRate}
                  onChange={(patch) => onTaskChange(task.id, patch)}
                  onDelete={() => onDeleteTask(task.id)}
                />
              ))}
            </TableBody>

            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Associate Total</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatTasksInteger(totals.tasks)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatHours(totals.timeWithout)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatHours(totals.timeWith)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatHours(totals.hoursSaved)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatUSD(totals.savings)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>

        <div>
          <Button type="button" size="sm" onClick={onAddTask}>
            <Plus className="size-4" />
            Add Task
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
