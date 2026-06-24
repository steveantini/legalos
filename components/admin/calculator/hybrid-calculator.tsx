"use client";

import { Info, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { calculatorConfig } from "@/config/site";
import { saveTaskBookAction } from "@/lib/workspace/admin/calculator/actions";
import {
  computeTaskBook,
  type MeasuredRuns,
} from "@/lib/workspace/admin/calculator/compute";
import type { AgentRun } from "@/lib/workspace/admin/calculator/measured";
import {
  type DraftConfig,
  type DraftMember,
  type DraftTaskType,
  type TaskBookConfig,
  toDraft,
  toNumeric,
} from "@/lib/workspace/admin/calculator/types";

import { InfoModal, type InfoTopic } from "./info-modal";
import {
  formatHours,
  formatHoursInteger,
  formatRoiPercent,
  formatUSD,
  formatUSDInteger,
} from "./math";

/**
 * The hybrid Productivity Calculator (Step A). Blends MEASURED run volume (live
 * from usage_events, per task type's mapped agent) with ESTIMATED salary and
 * per-run time savings, persists the assumptions per organization (DB, not
 * localStorage), and marks every number measured vs. estimate. The formulas are
 * unchanged; the data source and the honesty labeling are the change.
 *
 * Super admins edit and save; other admins see it read-only (mirror-RLS).
 */

const inputClass =
  "rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyMember(): DraftMember {
  return { id: newId(), name: "", salary: "" };
}

/** A new task row, mapped to an agent from the start (volume is always measured). */
function newTaskType(agentId: string): DraftTaskType {
  return {
    id: newId(),
    label: "",
    agentId,
    timeWithoutMinutes: "",
    timeWithMinutes: "",
  };
}

/** Small calm pill marking a value as measured (real usage) or an estimate. */
function Badge({ kind }: { kind: "measured" | "estimate" }) {
  const measured = kind === "measured";
  return (
    <span
      className={`inline-block rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] ${
        measured ? "bg-chat-cite-bg text-primary" : "bg-paper-2 text-caption"
      }`}
    >
      {measured ? "Measured" : "Estimate"}
    </span>
  );
}

export function HybridCalculator({
  initialConfig,
  agents,
  canEdit,
}: {
  initialConfig: TaskBookConfig;
  agents: AgentRun[];
  canEdit: boolean;
}) {
  const [draft, setDraft] = useState<DraftConfig>(() => toDraft(initialConfig));
  // Seed from the round-tripped config so the editor isn't "dirty" on first load.
  const [savedKey, setSavedKey] = useState(() =>
    JSON.stringify(toNumeric(toDraft(initialConfig))),
  );
  const [infoTopic, setInfoTopic] = useState<InfoTopic | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const measured: MeasuredRuns = useMemo(
    () => Object.fromEntries(agents.map((a) => [a.id, a.runs])),
    [agents],
  );
  const agentsById = useMemo(
    () => new Map(agents.map((a) => [a.id, a])),
    [agents],
  );

  const numeric = useMemo(() => toNumeric(draft), [draft]);
  const result = useMemo(() => computeTaskBook(numeric, measured), [numeric, measured]);

  const dirty = JSON.stringify(numeric) !== savedKey;

  // ── mutators (no-ops when read-only) ──
  function update(next: DraftConfig) {
    if (!canEdit) return;
    setDraft(next);
    setSaveState("idle");
  }
  const patchMember = (id: string, patch: Partial<DraftMember>) =>
    update({ ...draft, members: draft.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  const addMember = () => update({ ...draft, members: [...draft.members, emptyMember()] });
  const removeMember = (id: string) =>
    update({ ...draft, members: draft.members.filter((m) => m.id !== id) });
  const patchTask = (id: string, patch: Partial<DraftTaskType>) =>
    update({ ...draft, taskTypes: draft.taskTypes.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  const addTask = () => {
    // Default a new row to the first agent; the empty-agent case disables the
    // button (a task type can only ever be an agent's measured volume).
    const first = agents[0];
    if (!first) return;
    update({ ...draft, taskTypes: [...draft.taskTypes, newTaskType(first.id)] });
  };
  const removeTask = (id: string) =>
    update({ ...draft, taskTypes: draft.taskTypes.filter((t) => t.id !== id) });

  async function handleSave() {
    setSaveState("saving");
    setSaveError(null);
    const res = await saveTaskBookAction(numeric);
    if (res.ok) {
      setSavedKey(JSON.stringify(numeric));
      setSaveState("saved");
    } else {
      setSaveState("error");
      setSaveError(res.error);
    }
  }

  function handleExport() {
    triggerDownload(buildCsv(numeric, result, agentsById, calculatorConfig.costLabel));
  }

  return (
    <div className="mt-8 space-y-8">
      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Badge kind="measured" /> from your real usage
          </span>
          <span className="flex items-center gap-1.5">
            <Badge kind="estimate" /> your assumption
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setInfoTopic("methodology")}
        >
          <Info className="size-4" />
          How this is calculated
        </Button>
      </div>

      {!canEdit ? (
        <p className="rounded-lg bg-paper-2 px-4 py-2.5 text-[13px] text-muted-foreground">
          Read only. Only a super admin can edit this organization&apos;s task book.
        </p>
      ) : null}

      {/* Team */}
      <section className="space-y-3">
        <div>
          <h2 className="text-[17px] font-medium tracking-[-0.005em] text-foreground">
            Team
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-caption">
            Salaries are estimates <Badge kind="estimate" />; they set the blended
            hourly rate and the seat count for platform cost.
          </p>
        </div>

        <div className="space-y-2">
          {draft.members.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <input
                type="text"
                aria-label="Team member name"
                placeholder="Name or role"
                value={m.name}
                disabled={!canEdit}
                onChange={(e) => patchMember(m.id, { name: e.target.value })}
                className={`${inputClass} flex-1`}
              />
              <input
                type="number"
                min={0}
                aria-label="Annual salary"
                placeholder="Annual salary"
                value={m.salary}
                disabled={!canEdit}
                onChange={(e) => patchMember(m.id, { salary: e.target.value })}
                className={`${inputClass} w-40 text-right`}
              />
              {canEdit ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove team member"
                  onClick={() => removeMember(m.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </div>
          ))}
          {draft.members.length === 0 ? (
            <p className="text-[13px] text-caption">No team members yet.</p>
          ) : null}
        </div>

        {canEdit ? (
          <Button type="button" variant="outline" size="sm" onClick={addMember}>
            <Plus className="size-4" />
            Add team member
          </Button>
        ) : null}
      </section>

      {/* Task types */}
      <section className="space-y-3">
        <div>
          <h2 className="text-[17px] font-medium tracking-[-0.005em] text-foreground">
            Task types
          </h2>
          <p className="mt-1 text-[13px] text-caption">
            Map a task to an agent to measure how often it runs; the time saved per
            run is your estimate.
          </p>
        </div>

        <div className="space-y-3">
          {draft.taskTypes.map((t, i) => (
            <TaskTypeCard
              key={t.id}
              task={t}
              computed={result.taskTypes[i]}
              agents={agents}
              agentsById={agentsById}
              canEdit={canEdit}
              onPatch={(patch) => patchTask(t.id, patch)}
              onRemove={() => removeTask(t.id)}
            />
          ))}
          {draft.taskTypes.length === 0 ? (
            <p className="text-[13px] text-caption">No task types yet.</p>
          ) : null}
        </div>

        {canEdit ? (
          agents.length === 0 ? (
            <p className="text-[13px] text-caption">
              You need an active agent before you can measure a task.{" "}
              <Link
                href="/workspace/agents/new"
                className="font-medium text-primary hover:underline"
              >
                Create an agent
              </Link>{" "}
              first.
            </p>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={addTask}>
              <Plus className="size-4" />
              Add task type
            </Button>
          )
        ) : null}
      </section>

      {/* Cost assumption */}
      <section className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <span>{calculatorConfig.costLabel} per user</span>
          <Badge kind="estimate" />
          <input
            type="number"
            min={0}
            aria-label={`${calculatorConfig.costLabel} per user per year`}
            value={draft.costPerUserPerYear}
            disabled={!canEdit}
            onChange={(e) => update({ ...draft, costPerUserPerYear: e.target.value })}
            className={`${inputClass} w-28 text-right`}
          />
          <span>/ year</span>
        </label>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="More info: platform cost"
          onClick={() => setInfoTopic("agent-cost")}
          className="size-6"
        >
          <Info className="size-4" />
        </Button>
      </section>

      <hr className="border-border" />

      {/* Summary */}
      <section aria-label="Overall productivity gains" className="space-y-4">
        <div className="rounded-lg bg-muted/40 p-6">
          <h3 className="mb-1 text-center text-lg font-semibold">
            Overall productivity gains
          </h3>
          <p className="mx-auto mb-5 max-w-[60ch] text-center text-[12px] leading-[1.5] text-muted-foreground">
            A blended figure: measured run volume (trailing 12 months), your
            estimated time saved per run, and your estimated rates. The volume is
            real; the time saved and rates are estimates.
          </p>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <SummaryStat
              label="Total hours saved"
              value={formatHoursInteger(result.totalHoursSaved)}
              sub={
                <span className="flex items-center gap-1.5">
                  {calculatorConfig.costLabel}
                  <button
                    type="button"
                    aria-label="More info: platform cost"
                    onClick={() => setInfoTopic("agent-cost")}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Info className="size-4" />
                  </button>
                  <span className="font-medium tabular-nums text-foreground">
                    {formatUSDInteger(result.cost)}
                  </span>
                </span>
              }
            />
            <SummaryStat
              label="Total savings"
              value={formatUSD(result.totalSavings)}
              sub={
                <span className="flex items-center gap-1.5">
                  Total ROI
                  <button
                    type="button"
                    aria-label="More info: total ROI"
                    onClick={() => setInfoTopic("total-roi")}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Info className="size-4" />
                  </button>
                  <span
                    className={`font-medium tabular-nums ${
                      result.roi >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {formatRoiPercent(result.roi)}
                  </span>
                </span>
              }
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {canEdit ? (
            <div className="mr-auto flex items-center gap-3 text-[13px]">
              <Button type="button" onClick={handleSave} disabled={saveState === "saving" || !dirty}>
                {saveState === "saving" ? "Saving..." : "Save changes"}
              </Button>
              {saveState === "saved" && !dirty ? (
                <span className="text-muted-foreground">Saved</span>
              ) : null}
              {saveState === "error" ? (
                <span className="text-warn-fg" role="alert">
                  {saveError}
                </span>
              ) : null}
            </div>
          ) : null}
          <Button type="button" variant="outline" onClick={handleExport}>
            Create report
          </Button>
        </div>
      </section>

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

function SummaryStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-col items-center">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-3xl font-semibold tabular-nums">{value}</div>
      </div>
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {sub}
      </div>
    </div>
  );
}

function TaskTypeCard({
  task,
  computed,
  agents,
  agentsById,
  canEdit,
  onPatch,
  onRemove,
}: {
  task: DraftTaskType;
  computed: { annualHoursSaved: number; annualSavings: number; runsPerYear: number } | undefined;
  agents: AgentRun[];
  agentsById: Map<string, AgentRun>;
  canEdit: boolean;
  onPatch: (patch: Partial<DraftTaskType>) => void;
  onRemove: () => void;
}) {
  const mappedAgent = agentsById.get(task.agentId);
  const measuredRuns = mappedAgent?.runs ?? 0;
  const runsForDisplay = computed?.runsPerYear ?? 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-2">
        <input
          type="text"
          aria-label="Task description"
          placeholder="e.g. Review an inbound NDA"
          value={task.label}
          disabled={!canEdit}
          onChange={(e) => onPatch({ label: e.target.value })}
          className={`${inputClass} flex-1`}
        />
        {canEdit ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove task type"
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {/* Volume — always an agent's measured run count */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[12px] text-caption">
            Runs per year <Badge kind="measured" />
          </div>
          <select
            aria-label="Agent"
            value={task.agentId}
            disabled={!canEdit}
            onChange={(e) => onPatch({ agentId: e.target.value })}
            className={`${inputClass} w-full`}
          >
            {mappedAgent === undefined ? (
              <option value={task.agentId}>Unavailable agent</option>
            ) : null}
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.runs.toLocaleString("en-US")}/yr)
              </option>
            ))}
          </select>
          <p className="text-[13px] tabular-nums text-foreground">
            {measuredRuns.toLocaleString("en-US")} runs measured (last 12 months)
          </p>
        </div>

        {/* Time saved per run */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[12px] text-caption">
            Minutes per run <Badge kind="estimate" />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step="1"
              aria-label="Minutes per run without the agent"
              placeholder="Without"
              value={task.timeWithoutMinutes}
              disabled={!canEdit}
              onChange={(e) => onPatch({ timeWithoutMinutes: e.target.value })}
              className={`${inputClass} w-full text-right`}
            />
            <span className="text-[12px] text-caption">to</span>
            <input
              type="number"
              min={0}
              step="1"
              aria-label="Minutes per run with the agent"
              placeholder="With"
              value={task.timeWithMinutes}
              disabled={!canEdit}
              onChange={(e) => onPatch({ timeWithMinutes: e.target.value })}
              className={`${inputClass} w-full text-right`}
            />
          </div>
        </div>
      </div>

      {/* Derived */}
      <div className="mt-3 flex flex-wrap justify-end gap-x-8 gap-y-1 border-t border-hairline pt-3 text-[13px] tabular-nums">
        <span className="text-muted-foreground">
          Hours saved:{" "}
          <span className="text-foreground">
            {formatHours(computed?.annualHoursSaved ?? 0)}
          </span>
        </span>
        <span className="text-muted-foreground">
          Savings:{" "}
          <span className="text-foreground">{formatUSD(computed?.annualSavings ?? 0)}</span>
        </span>
        <span className="sr-only">{runsForDisplay} runs per year</span>
      </div>
    </div>
  );
}

// ── CSV export (new hybrid model) ──

function buildCsv(
  config: TaskBookConfig,
  result: ReturnType<typeof computeTaskBook>,
  agentsById: Map<string, AgentRun>,
  costLabel: string,
): string {
  const clean = (s: string) => s.replace(/,/g, "");
  let csv = "data:text/csv;charset=utf-8,";

  csv += "Productivity Calculator Export\n";
  csv += `Blended hourly rate ($),${result.orgHourlyRate.toFixed(2)}\n`;
  csv += `${clean(costLabel)} per user ($),${config.costPerUserPerYear}\n`;
  csv += `Team size (seats),${result.seatCount}\n\n`;

  csv +=
    "Task Type,Volume Source,Runs Per Year,Measured,Minutes Saved Per Run (est),Annual Hours Saved,Annual Savings ($)\n";
  config.taskTypes.forEach((t, i) => {
    const r = result.taskTypes[i];
    const source = clean(agentsById.get(t.agentId)?.name ?? "Unavailable agent");
    const minutesSaved = Math.max(t.timeWithoutMinutes - t.timeWithMinutes, 0);
    csv +=
      `${clean(t.label)},${source},${r.runsPerYear},${r.runsMeasured ? "yes" : "no"},` +
      `${minutesSaved},${formatHours(r.annualHoursSaved).replace(/,/g, "")},` +
      `${formatUSD(r.annualSavings).replace("$", "").replace(/,/g, "")}\n`;
  });

  csv += "\nOverall\n";
  csv += `Total Hours Saved,${formatHoursInteger(result.totalHoursSaved).replace(/,/g, "")}\n`;
  csv += `${clean(costLabel)} ($),${result.cost}\n`;
  csv += `Total Savings ($),${formatUSD(result.totalSavings).replace("$", "").replace(/,/g, "")}\n`;
  csv += `Total ROI (%),${formatRoiPercent(result.roi).replace("%", "")}\n`;

  return csv;
}

function triggerDownload(csv: string): void {
  const link = document.createElement("a");
  link.setAttribute("href", encodeURI(csv));
  link.setAttribute("download", "productivity_savings_data.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
