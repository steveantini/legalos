"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { startWorkflowRun } from "@/lib/actions/workflows";
// Autonomy belongs to the RUN, not the definition (Step 3); the shared choices
// carry the honest v1 contract wording (writes always pause for approval).
import { AUTONOMY_CHOICES } from "@/lib/workflows/autonomy-choices";
import { cn } from "@/lib/utils";

type Autonomy = "supervised" | "autonomous";

/** Map startWorkflowRun's error codes to honest, actionable copy. */
function startErrorMessage(error: string, errors?: string[]): string {
  switch (error) {
    case "not_runnable":
      return "This workflow isn’t active, so it can’t run. An admin can activate it in the builder.";
    case "invalid_definition":
      return errors?.length
        ? `This workflow needs fixes before it can run: ${errors.join(" ")}`
        : "This workflow needs fixes before it can run. An admin can update it in the builder.";
    case "not_found":
      return "This workflow no longer exists.";
    case "unauthenticated":
      return "Your session has expired. Sign in again to run this workflow.";
    default:
      return "The run couldn’t be started. Try again.";
  }
}

/**
 * Start a run of a saved workflow (Workflows arc, Step 4b): the run input the
 * first step consumes, the run-level autonomy choice (supervised default), and
 * Start. The run executes server-side inside startWorkflowRun, so the form
 * stays honest while it runs and lands on the run view when the action
 * returns (paused for approval, completed, or failed).
 */
export function RunWorkflowForm({ definitionId }: { definitionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [input, setInput] = useState("");
  const [autonomy, setAutonomy] = useState<Autonomy>("supervised");
  const [error, setError] = useState<string | null>(null);

  function start() {
    setError(null);
    startTransition(async () => {
      const trimmed = input.trim();
      const res = await startWorkflowRun(
        definitionId,
        trimmed.length > 0 ? trimmed : null,
        autonomy,
      );
      if (res.ok) {
        router.push(`/workspace/workflows/runs/${res.runId}`);
        router.refresh();
      } else {
        setError(startErrorMessage(res.error, res.errors));
      }
    });
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-2">
        <Label htmlFor="run-input">Input for this run</Label>
        <Textarea
          id="run-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Paste the contract text, or describe what to work on."
          rows={5}
          aria-describedby="run-input-hint"
        />
        <p id="run-input-hint" className="text-[12.5px] text-muted-foreground">
          The first step receives this as its starting input.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">
          Autonomy for this run
        </legend>
        <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {AUTONOMY_CHOICES.map((choice) => {
            const selected = autonomy === choice.value;
            return (
              <label
                key={choice.value}
                className={cn(
                  "flex cursor-pointer flex-col gap-1.5 rounded-[14px] border bg-card p-4 transition-colors",
                  selected
                    ? "border-primary/60"
                    : "border-border hover:bg-muted/40",
                )}
              >
                <span className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="autonomy"
                    value={choice.value}
                    checked={selected}
                    onChange={() => setAutonomy(choice.value)}
                    className="accent-primary"
                  />
                  <span className="text-[14px] font-medium text-foreground">
                    {choice.title}
                  </span>
                  {choice.value === "supervised" ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      Default
                    </span>
                  ) : null}
                </span>
                <span className="pl-[26px] text-[12.5px] leading-[1.5] text-muted-foreground">
                  {choice.description}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
        <Button type="button" onClick={start} disabled={pending} className="shrink-0 self-start">
          {pending ? "Running…" : "Start run"}
        </Button>
        <p aria-live="polite" className="text-[12.5px] text-muted-foreground">
          {pending
            ? "The run is executing now. You’ll land on its page when it pauses for you or finishes."
            : ""}
        </p>
      </div>
    </div>
  );
}
