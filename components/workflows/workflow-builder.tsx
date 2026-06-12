"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { ToolPicker } from "@/components/workflows/tool-picker";
import {
  deleteWorkflowDefinition,
  saveWorkflowDefinition,
} from "@/lib/actions/workflows";
import {
  splitToolArgs,
  workflowReadback,
  type ReadbackCapabilities,
} from "@/lib/workflows/builder-view";
import { toolPickerKey } from "@/lib/workflows/tool-picker-options";
import type {
  AgentOption,
  ToolArgSpec,
  ToolOption,
  WorkflowCapabilities,
} from "@/lib/workflows/capabilities";
import type {
  ValueSource,
  WorkflowStep,
  WorkflowStepType,
} from "@/lib/workflows/types";

type BuilderInitial = {
  id: string | null;
  name: string;
  description: string;
  departmentId: string | null;
  status: "draft" | "active";
  steps: WorkflowStep[];
};

const STEP_TYPE_LABEL: Record<WorkflowStepType, string> = {
  agent: "Run an agent",
  tool_action: "Take an action",
  human_checkpoint: "Human approval",
};

const DEFAULT_STEP_NAME: Record<WorkflowStepType, string> = {
  agent: "Run an agent",
  tool_action: "Take an action",
  human_checkpoint: "Wait for approval",
};

/** A short id for a new step (stable across edits, referenced by future edges). */
function newStepId(): string {
  return crypto.randomUUID();
}

function makeStep(type: WorkflowStepType): WorkflowStep {
  const base = { id: newStepId(), name: DEFAULT_STEP_NAME[type] };
  if (type === "agent") return { ...base, type, agentId: "" };
  if (type === "tool_action") return { ...base, type, serverId: "", toolName: "" };
  return { ...base, type, prompt: "" };
}

/**
 * A blank agent instruction never persists: the saved canonical graph keeps
 * the pre-D3 shape (no `instruction` key) unless the author actually wrote
 * one, and a written one is stored trimmed.
 */
function withCanonicalInstructions(steps: WorkflowStep[]): WorkflowStep[] {
  return steps.map((step) => {
    if (step.type !== "agent" || step.instruction === undefined) return step;
    const instruction = step.instruction.trim();
    if (!instruction) {
      const rest = { ...step };
      delete rest.instruction;
      return rest;
    }
    return instruction === step.instruction ? step : { ...step, instruction };
  });
}

// ---- ValueSource <-> select-key serialization ------------------------------

const PREVIOUS_KEY = "previous";
const RUN_INPUT_KEY = "run_input";
const LITERAL_KEY = "literal";
const UNSET_KEY = "__unset__";

function sourceToKey(source: ValueSource | undefined): string {
  if (!source) return UNSET_KEY;
  if (source.source === "step") return `step:${source.stepId}`;
  return source.source;
}

function keyToSource(key: string, literalValue: string): ValueSource | undefined {
  if (key === UNSET_KEY) return undefined;
  if (key === PREVIOUS_KEY) return { source: "previous" };
  if (key === RUN_INPUT_KEY) return { source: "run_input" };
  if (key === LITERAL_KEY) return { source: "literal", value: literalValue };
  if (key.startsWith("step:")) return { source: "step", stepId: key.slice(5) };
  return undefined;
}

/** Plain-language description of where the selected source pulls its value. */
function sourceHelp(key: string): string | null {
  if (key === PREVIOUS_KEY) {
    return "Uses the previous step’s output (for the first step, the run’s input).";
  }
  if (key === RUN_INPUT_KEY) return "Uses what you provide when you start the run.";
  if (key === LITERAL_KEY) {
    return "A fixed value you set here, used the same on every run.";
  }
  if (key.startsWith("step:")) return "Uses the output of the chosen earlier step.";
  return null;
}

/** A picker for where a step input (or a tool argument) comes from. */
function SourcePicker({
  value,
  priorSteps,
  includeUnset,
  onChange,
}: {
  value: ValueSource | undefined;
  priorSteps: Array<{ id: string; name: string; index: number }>;
  includeUnset: boolean;
  onChange: (next: ValueSource | undefined) => void;
}) {
  const literalValue =
    value && value.source === "literal" && typeof value.value === "string"
      ? value.value
      : "";
  const key = sourceToKey(value);
  // Base UI's SelectValue renders the trigger label from this map; without it
  // the trigger shows the raw value key ("literal", "step:<uuid>").
  const items: Record<string, string> = {
    ...(includeUnset ? { [UNSET_KEY]: "Not set" } : {}),
    [PREVIOUS_KEY]: "Previous step’s output",
    [RUN_INPUT_KEY]: "The run’s input",
    ...Object.fromEntries(
      priorSteps.map((s) => [
        `step:${s.id}`,
        `Output of step ${s.index + 1}: ${s.name || "Untitled"}`,
      ]),
    ),
    [LITERAL_KEY]: "Custom value",
  };
  const help = sourceHelp(key);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select
          value={key}
          items={items}
          onValueChange={(k) => onChange(keyToSource(k ?? UNSET_KEY, literalValue))}
        >
          <SelectTrigger className="h-8 w-full bg-paper-2 sm:w-[280px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {includeUnset ? <SelectItem value={UNSET_KEY}>Not set</SelectItem> : null}
            <SelectItem value={PREVIOUS_KEY}>Previous step&rsquo;s output</SelectItem>
            <SelectItem value={RUN_INPUT_KEY}>The run&rsquo;s input</SelectItem>
            {priorSteps.map((s) => (
              <SelectItem key={s.id} value={`step:${s.id}`}>
                Output of step {s.index + 1}: {s.name || "Untitled"}
              </SelectItem>
            ))}
            <SelectItem value={LITERAL_KEY}>Custom value</SelectItem>
          </SelectContent>
        </Select>
        {value?.source === "literal" ? (
          <Input
            value={literalValue}
            onChange={(e) => onChange({ source: "literal", value: e.target.value })}
            placeholder="Type the fixed value"
            className="h-8 bg-paper-2 sm:flex-1"
          />
        ) : null}
      </div>
      {help ? (
        <p className="text-[12px] leading-[1.5] text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}

// ---- Per-step editors ------------------------------------------------------

function AgentStepFields({
  step,
  agents,
  priorSteps,
  onChange,
}: {
  step: Extract<WorkflowStep, { type: "agent" }>;
  agents: AgentOption[];
  priorSteps: Array<{ id: string; name: string; index: number }>;
  onChange: (next: Extract<WorkflowStep, { type: "agent" }>) => void;
}) {
  const missing = step.agentId && !agents.some((a) => a.id === step.agentId);
  // Trigger labels resolve from this map (without it, Base UI's SelectValue
  // shows the raw agent UUID).
  const agentItems: Record<string, string> = {
    ...Object.fromEntries(agents.map((a) => [a.id, a.name])),
    ...(missing ? { [step.agentId]: "Unavailable agent" } : {}),
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Agent</Label>
        <Select
          value={step.agentId || null}
          items={agentItems}
          onValueChange={(v) => onChange({ ...step, agentId: v ?? "" })}
        >
          <SelectTrigger className="h-8 w-full bg-paper-2">
            <SelectValue placeholder="Choose an agent" />
          </SelectTrigger>
          <SelectContent>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
            {missing ? (
              <SelectItem value={step.agentId} disabled>
                Unavailable agent
              </SelectItem>
            ) : null}
          </SelectContent>
        </Select>
        {missing ? (
          <p className="text-[12.5px] text-destructive">
            This agent is no longer available. Pick another, or remove the step.
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`step-instruction-${step.id}`}>
          What should the agent do in this step?
        </Label>
        <Textarea
          id={`step-instruction-${step.id}`}
          value={step.instruction ?? ""}
          onChange={(e) => onChange({ ...step, instruction: e.target.value })}
          placeholder="e.g. Review this NDA and flag unusual terms"
          rows={2}
          className="bg-paper-2"
        />
        <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
          Optional. The agent keeps its own expertise; this directs what it does
          here. It can use your connected tools, and it pauses for your approval
          before any action that changes another system, like sending an email.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label>Input</Label>
        <SourcePicker
          value={step.inputMapping ?? { source: "previous" }}
          priorSteps={priorSteps}
          includeUnset={false}
          onChange={(src) => onChange({ ...step, inputMapping: src })}
        />
      </div>
    </div>
  );
}

/**
 * One tool argument: its name and type, the server's own description of it
 * (when the discovered schema carries one), and where its value comes from.
 */
function ToolArgField({
  arg,
  value,
  priorSteps,
  onChange,
}: {
  arg: ToolArgSpec;
  value: ValueSource | undefined;
  priorSteps: Array<{ id: string; name: string; index: number }>;
  onChange: (next: ValueSource | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-medium text-foreground">{arg.name}</span>
        <span className="text-[11.5px] text-muted-foreground">
          {arg.type}
          {arg.required ? " · required" : ""}
        </span>
      </div>
      {arg.description ? (
        <p className="text-[12px] leading-[1.5] text-muted-foreground">
          {arg.description}
        </p>
      ) : null}
      <SourcePicker
        value={value}
        priorSteps={priorSteps}
        includeUnset
        onChange={onChange}
      />
    </div>
  );
}

function ToolStepFields({
  step,
  tools,
  priorSteps,
  onChange,
}: {
  step: Extract<WorkflowStep, { type: "tool_action" }>;
  tools: ToolOption[];
  priorSteps: Array<{ id: string; name: string; index: number }>;
  onChange: (next: Extract<WorkflowStep, { type: "tool_action" }>) => void;
}) {
  const toolKey = step.serverId && step.toolName ? `${step.serverId}::${step.toolName}` : "";
  const selected = tools.find((t) => t.serverId === step.serverId && t.toolName === step.toolName);
  const missing = Boolean(toolKey) && !selected;
  const argMapping = step.argMapping ?? {};
  // Essentials up front; optional args behind a disclosure (builder-view.ts).
  const { essential, advanced } = splitToolArgs(selected?.args ?? []);

  function setArgSource(argName: string, src: ValueSource | undefined) {
    const next = { ...argMapping };
    if (src) next[argName] = src;
    else delete next[argName];
    onChange({ ...step, argMapping: next });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Tool</Label>
        <ToolPicker
          tools={tools}
          value={toolKey}
          onValueChange={(key) => {
            const [serverId, toolName] = key.split("::");
            // Switching tools clears the prior argument mapping (different schema).
            onChange({ ...step, serverId, toolName, argMapping: {} });
          }}
        />
        {missing ? (
          <p className="text-[12.5px] text-destructive">
            This tool is no longer connected. Pick another, or remove the step.
          </p>
        ) : null}
        {selected ? (
          <p className="text-[12.5px] text-muted-foreground">
            {selected.access === "write" ? (
              <span className="text-foreground">
                Takes a write action, so the run pauses for approval before it runs.{" "}
              </span>
            ) : null}
            {selected.description}
          </p>
        ) : null}
      </div>

      {selected && selected.args.length > 0 ? (
        <div className="flex flex-col gap-3">
          <Label>Inputs to the tool</Label>
          <div className="flex flex-col gap-3 rounded-lg border border-border p-3.5">
            {essential.map((arg) => (
              <ToolArgField
                key={arg.name}
                arg={arg}
                value={argMapping[arg.name]}
                priorSteps={priorSteps}
                onChange={(src) => setArgSource(arg.name, src)}
              />
            ))}
            {advanced.length > 0 ? (
              <details className="group">
                <summary className="cursor-pointer list-none rounded font-mono text-[11px] uppercase tracking-[0.05em] text-caption transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                  More options · {advanced.length} ·{" "}
                  <span className="group-open:hidden">show</span>
                  <span className="hidden group-open:inline">hide</span>
                </summary>
                <div className="mt-3 flex flex-col gap-3">
                  {advanced.map((arg) => (
                    <ToolArgField
                      key={arg.name}
                      arg={arg}
                      value={argMapping[arg.name]}
                      priorSteps={priorSteps}
                      onChange={(src) => setArgSource(arg.name, src)}
                    />
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CheckpointStepFields({
  step,
  onChange,
}: {
  step: Extract<WorkflowStep, { type: "human_checkpoint" }>;
  onChange: (next: Extract<WorkflowStep, { type: "human_checkpoint" }>) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>What the approver sees</Label>
      <Textarea
        value={step.prompt}
        onChange={(e) => onChange({ ...step, prompt: e.target.value })}
        placeholder="e.g. Review the draft response before it goes out."
        rows={2}
        className="bg-paper-2"
      />
      <p className="text-[12.5px] text-muted-foreground">
        The run pauses here until a person approves or declines.
      </p>
    </div>
  );
}

// ---- The builder -----------------------------------------------------------

export function WorkflowBuilder({
  capabilities,
  initial,
}: {
  capabilities: WorkflowCapabilities;
  initial: BuilderInitial;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [departmentId, setDepartmentId] = useState<string | null>(initial.departmentId);
  const [status, setStatus] = useState<"draft" | "active">(initial.status);
  const [steps, setSteps] = useState<WorkflowStep[]>(initial.steps);
  const [errors, setErrors] = useState<string[]>([]);
  // Which save affordance is in flight (plain Save, or Save and run).
  const [saving, setSaving] = useState<"save" | "save_run" | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePending, startDeleteTransition] = useTransition();

  // The compose-time readback: the workflow as plain language, one phrase per
  // step, derived live from the same capabilities the pickers offer.
  const readbackCaps = useMemo<ReadbackCapabilities>(
    () => ({
      agentNameById: new Map(capabilities.agents.map((a) => [a.id, a.name])),
      toolByKey: new Map(
        capabilities.tools.map((t) => [
          toolPickerKey(t.serverId, t.toolName),
          { fullLabel: t.fullLabel, access: t.access },
        ]),
      ),
    }),
    [capabilities],
  );
  const readback = useMemo(
    () => workflowReadback(steps, readbackCaps),
    [steps, readbackCaps],
  );

  const priorStepsBefore = useMemo(
    () =>
      steps.map((_, i) =>
        steps
          .slice(0, i)
          .map((s, index) => ({ id: s.id, name: s.name, index }))
          .filter((s) => {
            const original = steps[s.index];
            return original.type === "agent" || original.type === "tool_action";
          }),
      ),
    [steps],
  );

  function updateStep(index: number, next: WorkflowStep) {
    setSteps((prev) => prev.map((s, i) => (i === index ? next : s)));
  }
  function addStep(type: WorkflowStepType) {
    setSteps((prev) => [...prev, makeStep(type)]);
  }
  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }
  function moveStep(index: number, dir: -1 | 1) {
    setSteps((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  /**
   * Hard-delete the definition. Run history survives by design: every run
   * keeps its own definition snapshot, and the runs FK is set-null on delete.
   *
   * Success NAVIGATES ONLY — deliberately no router.refresh(): the current
   * route IS the deleted workflow's edit page, and a refresh batched into
   * this transition re-fetches that now-nonexistent route and wedges the
   * whole transition (the spinner-forever delete bug). The action
   * revalidates the my-workflows list server-side, so the navigation
   * arrives fresh. (save/fork keep push+refresh: their current routes
   * survive their mutations.)
   */
  function deleteWorkflow() {
    const id = initial.id;
    if (!id) return;
    startDeleteTransition(async () => {
      const res = await deleteWorkflowDefinition(id);
      if (res.ok) {
        toast.success("Workflow deleted.");
        router.push("/workspace/workflows/my-workflows");
      } else {
        setConfirmingDelete(false);
        toast.error(res.error);
      }
    });
  }

  /**
   * Save the workflow; `thenRun` continues straight to the run-start page
   * (the compose → try loop in one move). Only offered for an active workflow,
   * since only active workflows can run.
   */
  function save(thenRun: boolean) {
    setErrors([]);
    setSaving(thenRun ? "save_run" : "save");
    startTransition(async () => {
      const res = await saveWorkflowDefinition({
        id: initial.id,
        name,
        description,
        departmentId,
        status,
        steps: withCanonicalInstructions(steps),
      });
      if (res.ok) {
        toast.success(initial.id ? "Workflow saved." : "Workflow created.");
        router.push(
          thenRun
            ? `/workspace/workflows/my-workflows/${res.id}/run`
            : "/workspace/workflows/my-workflows",
        );
        router.refresh();
      } else {
        setSaving(null);
        setErrors(res.errors ?? (res.error ? [res.error] : ["The workflow couldn't be saved."]));
        if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {errors.length > 0 ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <p className="font-medium">This workflow needs a few fixes:</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Workflow details */}
      <section className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="wf-name">Name</Label>
          <Input
            id="wf-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Review an inbound NDA"
            className="bg-paper-2"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="wf-description">Description</Label>
          <Textarea
            id="wf-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this workflow does, in a sentence."
            rows={2}
            className="bg-paper-2"
          />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>Department</Label>
            <Select
              value={departmentId ?? "__org__"}
              items={{
                __org__: "Whole organization",
                ...Object.fromEntries(
                  capabilities.departments.map((d) => [d.id, d.name]),
                ),
              }}
              onValueChange={(v) => setDepartmentId(!v || v === "__org__" ? null : v)}
            >
              <SelectTrigger className="h-8 w-full bg-paper-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__org__">Whole organization</SelectItem>
                {capabilities.departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Status</Label>
            <Select
              value={status}
              items={{ draft: "Draft", active: "Active" }}
              onValueChange={(v) => setStatus(v === "active" ? "active" : "draft")}
            >
              <SelectTrigger className="h-8 w-full bg-paper-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
              Only active workflows can be run. A draft stays editable while you
              shape it.
            </p>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-[17px] font-medium tracking-[-0.012em] text-foreground">Steps</h2>
          <p className="mt-1 text-[13px] leading-[1.5] text-muted-foreground">
            A workflow starts from an input you provide when you run it. Steps run
            in order; each works on the previous step&rsquo;s output unless you point
            it somewhere else.
          </p>
        </div>

        {steps.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-border bg-card/50 px-6 py-8 text-center">
            <p className="text-[14px] font-medium text-foreground">
              Start with an agent step
            </p>
            <p className="max-w-[52ch] text-[13px] leading-[1.5] text-muted-foreground">
              Pick an agent and tell it what to do in plain language. It can read
              from your connected tools, and it pauses for your approval before any
              action that changes another system, like sending an email.
            </p>
          </div>
        ) : (
          <ol className="flex flex-col gap-3">
            {steps.map((step, index) => (
              <li
                key={step.id}
                className="rounded-[14px] border border-border bg-card p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-[12px] font-medium text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="text-[13px] font-medium text-foreground">
                      {STEP_TYPE_LABEL[step.type]}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Move step up"
                      disabled={index === 0}
                      onClick={() => moveStep(index, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Move step down"
                      disabled={index === steps.length - 1}
                      onClick={() => moveStep(index, 1)}
                    >
                      ↓
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove step"
                      onClick={() => removeStep(index)}
                    >
                      ✕
                    </Button>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={`step-name-${step.id}`}>Step name</Label>
                    <Input
                      id={`step-name-${step.id}`}
                      value={step.name}
                      onChange={(e) => updateStep(index, { ...step, name: e.target.value })}
                      className="bg-paper-2"
                    />
                  </div>

                  {step.type === "agent" ? (
                    <AgentStepFields
                      step={step}
                      agents={capabilities.agents}
                      priorSteps={priorStepsBefore[index]}
                      onChange={(next) => updateStep(index, next)}
                    />
                  ) : step.type === "tool_action" ? (
                    <ToolStepFields
                      step={step}
                      tools={capabilities.tools}
                      priorSteps={priorStepsBefore[index]}
                      onChange={(next) => updateStep(index, next)}
                    />
                  ) : (
                    <CheckpointStepFields
                      step={step}
                      onChange={(next) => updateStep(index, next)}
                    />
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}

        {/* Agent-first framing: the agent step is the primary path; the explicit
            tool step is the precise, advanced option (D-123). */}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={() => addStep("agent")}>
            + Run an agent
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addStep("human_checkpoint")}
          >
            + Human approval
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => addStep("tool_action")}
          >
            + Take an action (advanced)
          </Button>
        </div>

        {/* The compose-time readback: the workflow as plain language, so the
            operator can read what it does while building it. */}
        {steps.length > 0 ? (
          <div className="rounded-[14px] border border-border bg-card/50 px-4 py-3.5">
            <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-caption">
              What this workflow does
            </p>
            <ol className="mt-2 flex flex-col gap-1">
              {readback.map((phrase, i) => (
                <li
                  key={steps[i].id}
                  className="flex gap-2 text-[13px] leading-[1.55] text-foreground/90"
                >
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {i + 1}.
                  </span>
                  <span>{phrase}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>

      {/* Delete / Save */}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-6">
        <div>
          {initial.id ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete workflow
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/workspace/workflows/my-workflows"
            className={buttonVariants({ variant: "ghost" })}
          >
            Cancel
          </Link>
          {/* Save and run closes the compose → try loop. Only an active
              workflow can run, so a draft leaves this disabled (the status
              field explains why). */}
          <Button
            type="button"
            variant="outline"
            onClick={() => save(true)}
            disabled={saving !== null || status !== "active"}
          >
            {saving === "save_run" ? "Saving…" : "Save and run"}
          </Button>
          <Button type="button" onClick={() => save(false)} disabled={saving !== null}>
            {saving === "save" ? "Saving…" : "Save workflow"}
          </Button>
        </div>
      </div>

      <Dialog
        open={confirmingDelete}
        onOpenChange={(open) => {
          if (!open && !deletePending) setConfirmingDelete(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this workflow?</DialogTitle>
            <DialogDescription>
              <strong>{name.trim() || "This workflow"}</strong> will be
              permanently deleted and can no longer be run or edited. Past runs
              are kept and remain viewable, since each run stores its own copy
              of the steps it executed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmingDelete(false)}
              disabled={deletePending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={deleteWorkflow}
              disabled={deletePending}
            >
              {deletePending ? "Deleting…" : "Delete workflow"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
