"use client";

/**
 * Productivity Gains Calculator. Ported from
 * `agent-launchpad-template/admin.html` (lines ~1115–1968) under
 * Constraint C — see CLAUDE.md "Reference Ports". Field structure,
 * formulas, totals, modal copy, CSV schema, and storage shape match
 * the original. Visual style follows shadcn defaults (Constraint B).
 *
 * Storage key note: the prior (paraphrased) calculator used
 * `launchpad_calculator_state`; this implementation uses
 * `launchpad_calculator_data` (matches the original's
 * `SP + 'calculator_data'` where `SP = "launchpad_"`). The keys
 * differ, so old broken-shape data cannot collide with this shape.
 */

import { Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { calculatorConfig } from "@/config/site";

import {
  AssociateCard,
  type Associate,
} from "./associate-card";
import { InfoModal, type InfoTopic } from "./info-modal";
import {
  formatHours,
  formatHoursInteger,
  formatRoiPercent,
  formatUSD,
  hourlyRateFromSalary,
  hoursSaved as calcHoursSaved,
  parseHours,
  parseSalary,
  parseTasks,
  platformCost,
  roiPercent,
  rowSavings,
} from "./math";
import { SummaryPanel } from "./summary-panel";
import type { Task } from "./task-row";

const STORAGE_KEY = "launchpad_calculator_data";

interface PersistedTask {
  name: string;
  tasksPerYear: string;
  timeWithout: string;
  timeWith: string;
}
interface PersistedAssociate {
  name: string;
  salary: string;
  tasks: PersistedTask[];
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyTask(): Task {
  return {
    id: newId(),
    name: "",
    tasksPerYear: "",
    timeWithout: "",
    timeWith: "",
  };
}

function emptyAssociate(): Associate {
  return {
    id: newId(),
    name: "",
    salary: "",
    tasks: [emptyTask()],
  };
}

function isPersistedTask(value: unknown): value is PersistedTask {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === "string" &&
    typeof v.tasksPerYear === "string" &&
    typeof v.timeWithout === "string" &&
    typeof v.timeWith === "string"
  );
}

function isPersistedAssociate(value: unknown): value is PersistedAssociate {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === "string" &&
    typeof v.salary === "string" &&
    Array.isArray(v.tasks) &&
    v.tasks.every(isPersistedTask)
  );
}

function loadAssociates(): Associate[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    if (!parsed.every(isPersistedAssociate)) return null;
    return parsed.map((a) => ({
      id: newId(),
      name: a.name,
      salary: a.salary,
      tasks:
        a.tasks.length > 0
          ? a.tasks.map((t) => ({
              id: newId(),
              name: t.name,
              tasksPerYear: t.tasksPerYear,
              timeWithout: t.timeWithout,
              timeWith: t.timeWith,
            }))
          : [emptyTask()],
    }));
  } catch (err) {
    console.warn(
      "calculator loadAssociates failed",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

function saveAssociates(associates: Associate[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedAssociate[] = associates.map((a) => ({
      name: a.name,
      salary: a.salary,
      tasks: a.tasks.map((t) => ({
        name: t.name,
        tasksPerYear: t.tasksPerYear,
        timeWithout: t.timeWithout,
        timeWith: t.timeWith,
      })),
    }));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn(
      "calculator saveAssociates failed",
      err instanceof Error ? err.message : String(err),
    );
  }
}

interface AssociateComputed {
  hourlyRate: number;
  totals: {
    tasks: number;
    timeWithout: number;
    timeWith: number;
    hoursSaved: number;
    savings: number;
  };
}

function computeAssociate(a: Associate): AssociateComputed {
  const hourlyRate = hourlyRateFromSalary(parseSalary(a.salary));
  const totals = a.tasks.reduce(
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
  return { hourlyRate, totals };
}

// CSV: matches the original's exact schema (lines 1792–1833 of
// agent-launchpad-template/admin.html). Field commas are stripped
// from text fields to keep the row layout intact, identically to the
// original. Numeric fields are emitted as the user typed them where
// applicable, so the export reflects raw input alongside derived values.
function buildCsv(
  associates: Associate[],
  totals: { hours: number; savings: number; cost: number; roi: number },
  costLabel: string,
): string {
  let csv = "data:text/csv;charset=utf-8,";
  csv +=
    "Team Member,Annual Salary,Hourly Rate,Task Description,Tasks Per Year,Annual Time w/o Agent (Hours),Annual Time w/ Agent (Hours),Annual Hours Saved,Annual Savings ($)\n";

  for (const a of associates) {
    const { hourlyRate, totals: at } = computeAssociate(a);
    const name = a.name.replace(/,/g, "");
    const salary = a.salary;
    const rate = hourlyRate
      .toFixed(2)
      .replace(/,/g, ""); // hourly rate exported as plain decimal, no thousands separators

    csv += `${name},${salary},${rate},,,,\n`;

    for (const t of a.tasks) {
      const taskName = t.name.replace(/,/g, "");
      const tasksPerYear = t.tasksPerYear;
      const timeWithout = t.timeWithout;
      const timeWith = t.timeWith;
      const saved = calcHoursSaved(
        parseHours(t.timeWithout),
        parseHours(t.timeWith),
      );
      const rowSav = rowSavings(saved, hourlyRate);
      const hoursStr = formatHours(saved).replace(/,/g, "");
      const savStr = formatUSD(rowSav).replace("$", "").replace(/,/g, "");
      csv += ` ,,${taskName},${tasksPerYear},${timeWithout},${timeWith},${hoursStr},${savStr}\n`;
    }

    const totalTasks = at.tasks.toLocaleString();
    const totalHours = formatHours(at.hoursSaved).replace(/,/g, "");
    const totalSavings = formatUSD(at.savings)
      .replace("$", "")
      .replace(/,/g, "");
    csv += ` ,Team Member Total,,${totalTasks},, ,${totalHours},${totalSavings}\n`;
    csv += "\n";
  }

  csv += "\nOverall Productivity Gains\n";
  csv += `Total Hours Saved,${formatHoursInteger(totals.hours).replace(/,/g, "")}\n`;
  csv += `Total Savings ($),${formatUSD(totals.savings).replace("$", "").replace(/,/g, "")}\n`;
  csv += `${costLabel} ($),${totals.cost.toString().replace(/,/g, "")}\n`;
  csv += `Total ROI (%),${formatRoiPercent(totals.roi).replace("%", "")}\n`;

  return csv;
}

function triggerDownload(csv: string, filename: string): void {
  const link = document.createElement("a");
  link.setAttribute("href", encodeURI(csv));
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function ProductivityCalculator() {
  const [associates, setAssociates] = useState<Associate[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [infoTopic, setInfoTopic] = useState<InfoTopic | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Mount-time hydration from localStorage. `setAssociates` here
    // synchronizes React with an external system (localStorage),
    // which is the documented exception to react-hooks/set-state-in-effect.
    const loaded = loadAssociates();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAssociates(loaded ?? [emptyAssociate()]);
    setHydrated(true);
  }, []);

  useEffect(() => {
    // Skip the initial empty render before hydration; only persist
    // once we've loaded (or seeded) the real state.
    if (!hydrated) return;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    saveAssociates(associates);
  }, [associates, hydrated]);

  const grand = useMemo(() => {
    let hours = 0;
    let savings = 0;
    for (const a of associates) {
      const { totals } = computeAssociate(a);
      hours += totals.hoursSaved;
      savings += totals.savings;
    }
    const cost = platformCost(
      associates.length,
      calculatorConfig.costPerUserPerYear,
    );
    const roi = roiPercent(savings, cost);
    return { hours, savings, cost, roi };
  }, [associates]);

  function patchAssociate(
    id: string,
    patch: Partial<Omit<Associate, "id" | "tasks">>,
  ) {
    setAssociates((curr) =>
      curr.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    );
  }

  function patchTask(
    associateId: string,
    taskId: string,
    patch: Partial<Omit<Task, "id">>,
  ) {
    setAssociates((curr) =>
      curr.map((a) =>
        a.id === associateId
          ? {
              ...a,
              tasks: a.tasks.map((t) =>
                t.id === taskId ? { ...t, ...patch } : t,
              ),
            }
          : a,
      ),
    );
  }

  function addTask(associateId: string) {
    setAssociates((curr) =>
      curr.map((a) =>
        a.id === associateId ? { ...a, tasks: [...a.tasks, emptyTask()] } : a,
      ),
    );
  }

  function deleteTask(associateId: string, taskId: string) {
    setAssociates((curr) =>
      curr.map((a) =>
        a.id === associateId
          ? { ...a, tasks: a.tasks.filter((t) => t.id !== taskId) }
          : a,
      ),
    );
  }

  function addAssociate() {
    setAssociates((curr) => [...curr, emptyAssociate()]);
  }

  function removeAssociate(id: string) {
    setAssociates((curr) => curr.filter((a) => a.id !== id));
  }

  function handleExport() {
    const csv = buildCsv(associates, grand, calculatorConfig.costLabel);
    triggerDownload(csv, "productivity_savings_data.csv");
  }

  if (!hydrated) {
    // Avoid SSR hydration mismatch and a flash of seeded data; the
    // first effect runs immediately on mount.
    return <div aria-busy="true" className="mt-8 h-32" />;
  }

  return (
    <div className="mt-8 space-y-6">
      <div className="space-y-6">
        {associates.map((a, i) => (
          <AssociateCard
            key={a.id}
            associate={a}
            index={i}
            onChange={(patch) => patchAssociate(a.id, patch)}
            onTaskChange={(taskId, patch) => patchTask(a.id, taskId, patch)}
            onAddTask={() => addTask(a.id)}
            onDeleteTask={(taskId) => deleteTask(a.id, taskId)}
            onRemove={() => removeAssociate(a.id)}
            onInfoOpen={(topic) => setInfoTopic(topic)}
          />
        ))}
      </div>

      <div className="flex justify-center">
        <Button type="button" variant="outline" onClick={addAssociate}>
          <Plus className="size-4" />
          Add Team Member
        </Button>
      </div>

      <hr className="border-border" />

      <SummaryPanel
        totalHours={grand.hours}
        totalSavings={grand.savings}
        agentCost={grand.cost}
        roi={grand.roi}
        costLabel={calculatorConfig.costLabel}
        onInfoOpen={(topic) => setInfoTopic(topic)}
        onExport={handleExport}
      />

      <InfoModal
        topic={infoTopic}
        costLabel={calculatorConfig.costLabel}
        costDescription={calculatorConfig.costDescription}
        onOpenChange={(open) => {
          if (!open) setInfoTopic(null);
        }}
      />
    </div>
  );
}
