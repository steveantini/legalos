"use client";

import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateAgentModelAction } from "@/lib/actions/agents";
import { modelLabel } from "@/lib/llm/model-label";

interface ModelPickerProps {
  agentId: string;
  initialModel: string;
}

/**
 * Composer's model picker (session 17a, spec §2.7).
 *
 * Per-agent persistence — each selection calls `updateAgentModelAction`
 * which updates the agent's `model` column owner-only via RLS. The
 * agent header's model chip (server-rendered from the same record)
 * refreshes via `revalidatePath('/agents/<id>')` after each successful
 * change.
 *
 * Three-model dropdown by design (D-030 surprise (3): the composer
 * surfaces the common-case picks; the niche `claude-opus-4-6` entry
 * stays reachable through the full edit form). The trigger label is
 * read-through — it shows the agent's current model even if it's
 * outside the three-option list, so a power user who picked opus-4-6
 * via the form sees their actual current model in the trigger.
 *
 * Optimistic update: trigger label flips immediately on selection,
 * action runs in a transition, label reverts on action failure with a
 * toast. The `pending` flag from `useTransition` disables the trigger
 * during the round-trip.
 *
 * Visual treatment matches `.cx .compose .model` from the visual
 * reference: mono caps, hairline border, paper-2 fill, muted-fg text.
 * Distinct from the slate-blue `WebSearchToggle` active state — this
 * is a neutral picker, not a state indicator. Chevron rotates 180°
 * when open per the spec's 220ms cubic-bezier rotation timing.
 */
const COMPOSER_MODEL_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "anthropic/claude-sonnet-4-6", label: "Sonnet 4.6" },
  { value: "anthropic/claude-opus-4-7", label: "Opus 4.7" },
  { value: "anthropic/claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];

export function ModelPicker({ agentId, initialModel }: ModelPickerProps) {
  const [model, setModel] = useState(initialModel);
  const [pending, startTransition] = useTransition();

  function handleSelect(nextModel: string) {
    if (pending || nextModel === model) return;
    const previous = model;
    setModel(nextModel);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("agent_id", agentId);
      formData.set("model", nextModel);

      const result = await updateAgentModelAction(formData);
      if (!result.ok) {
        setModel(previous);
        toast.error(result.error);
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        className="group inline-flex items-center gap-1.5 rounded-[7px] border border-border bg-paper-2 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground transition-[background-color,color,border-color] duration-[180ms] ease hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        aria-label={`Model: ${modelLabel(model)}. Change model.`}
      >
        <span>{modelLabel(model)}</span>
        <ChevronDownIcon className="size-3 transition-transform duration-[220ms] ease-[cubic-bezier(.2,.7,.2,1)] group-data-[popup-open]:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6}>
        {COMPOSER_MODEL_OPTIONS.map((option) => {
          const selected = option.value === model;
          return (
            <DropdownMenuItem
              key={option.value}
              onClick={() => handleSelect(option.value)}
              className="flex items-center justify-between gap-3 pr-2"
            >
              <span>{option.label}</span>
              {selected ? <CheckIcon className="size-3.5 text-primary" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
