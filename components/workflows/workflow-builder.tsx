"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
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
import { saveWorkflowDefinition } from "@/lib/actions/workflows";
import type {
  AgentOption,
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

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Select
        value={key}
        onValueChange={(k) => onChange(keyToSource(k ?? UNSET_KEY, literalValue))}
      >
        <SelectTrigger className="h-8 w-full sm:w-[260px]">
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
          placeholder="Custom value"
          className="h-8 sm:flex-1"
        />
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
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Agent</Label>
        <Select value={step.agentId || null} onValueChange={(v) => onChange({ ...step, agentId: v ?? "" })}>
          <SelectTrigger className="h-8">
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
        <Label>Input</Label>
        <SourcePicker
          value={step.inputMapping ?? { source: "previous" }}
          priorSteps={priorSteps}
          includeUnset={false}
          onChange={(src) => onChange({ ...step, inputMapping: src })}
        />
        <p className="text-[12.5px] text-muted-foreground">
          What the agent works on. Defaults to the previous step&rsquo;s output (the
          run&rsquo;s input for the first step).
        </p>
      </div>
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Tool</Label>
        <Select
          value={toolKey || null}
          onValueChange={(v) => {
            if (!v) return;
            const [serverId, toolName] = v.split("::");
            // Switching tools clears the prior argument mapping (different schema).
            onChange({ ...step, serverId, toolName, argMapping: {} });
          }}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Choose a connected tool" />
          </SelectTrigger>
          <SelectContent>
            {tools.map((t) => (
              <SelectItem key={`${t.serverId}::${t.toolName}`} value={`${t.serverId}::${t.toolName}`}>
                {t.fullLabel}
                {t.access === "write" ? "  (requires approval)" : ""}
              </SelectItem>
            ))}
            {missing ? (
              <SelectItem value={toolKey} disabled>
                Unavailable tool
              </SelectItem>
            ) : null}
          </SelectContent>
        </Select>
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
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-paper-2 p-3.5">
            {selected.args.map((arg) => (
              <div key={arg.name} className="flex flex-col gap-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-medium text-foreground">{arg.name}</span>
                  <span className="text-[11.5px] text-muted-foreground">
                    {arg.type}
                    {arg.required ? " · required" : ""}
                  </span>
                </div>
                <SourcePicker
                  value={argMapping[arg.name]}
                  priorSteps={priorSteps}
                  includeUnset
                  onChange={(src) => {
                    const next = { ...argMapping };
                    if (src) next[arg.name] = src;
                    else delete next[arg.name];
                    onChange({ ...step, argMapping: next });
                  }}
                />
              </div>
            ))}
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
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [departmentId, setDepartmentId] = useState<string | null>(initial.departmentId);
  const [status, setStatus] = useState<"draft" | "active">(initial.status);
  const [steps, setSteps] = useState<WorkflowStep[]>(initial.steps);
  const [errors, setErrors] = useState<string[]>([]);

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

  function save() {
    setErrors([]);
    startTransition(async () => {
      const res = await saveWorkflowDefinition({
        id: initial.id,
        name,
        description,
        departmentId,
        status,
        steps,
      });
      if (res.ok) {
        toast.success(initial.id ? "Workflow saved." : "Workflow created.");
        router.push("/workspace/workflows/my-workflows");
        router.refresh();
      } else {
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
          />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>Department</Label>
            <Select
              value={departmentId ?? "__org__"}
              onValueChange={(v) => setDepartmentId(!v || v === "__org__" ? null : v)}
            >
              <SelectTrigger className="h-8">
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
            <Select value={status} onValueChange={(v) => setStatus(v === "active" ? "active" : "draft")}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-[17px] font-medium tracking-[-0.012em] text-foreground">Steps</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Run in order. Each step works on the previous step&rsquo;s output unless you
            point it somewhere else.
          </p>
        </div>

        {steps.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card/50 px-4 py-6 text-center text-[13px] text-muted-foreground">
            No steps yet. Add the first one below.
          </p>
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

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => addStep("agent")}>
            + Run an agent
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => addStep("tool_action")}>
            + Take an action
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addStep("human_checkpoint")}
          >
            + Human approval
          </Button>
        </div>
      </section>

      {/* Save */}
      <div className="flex items-center justify-end gap-3 border-t border-border pt-6">
        <Link
          href="/workspace/workflows/my-workflows"
          className={buttonVariants({ variant: "ghost" })}
        >
          Cancel
        </Link>
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save workflow"}
        </Button>
      </div>
    </div>
  );
}
