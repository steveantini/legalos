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
import { modelDisplayName, modelDisplayNameShort } from "@/lib/llm/model-label";
import { COMPOSER_MODEL_IDS } from "@/lib/llm/models";

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
 * refreshes via `revalidatePath('/workspace/agents/<id>')` after each
 * successful change.
 *
 * Quick-pick by design (D-030 surprise (3)): the composer surfaces the
 * common-case picks, derived from the canonical models source's
 * `inComposerQuickPick` flag — today Fable 5, Opus 4.8, Sonnet 4.6, and
 * Haiku 4.5 — which mirrors the entire selectable set (the older Opus 4.7 /
 * 4.6 generations are retained for existing references but cannot be newly
 * selected anywhere). The trigger label is read-through — it shows the
 * agent's current model even if it's outside the quick-pick, so an agent
 * still configured on a legacy Opus model shows its actual current model in
 * the trigger.
 *
 * Optimistic update: trigger label flips immediately on selection,
 * action runs in a transition, label reverts on action failure with a
 * toast. The `pending` flag from `useTransition` disables the trigger
 * during the round-trip.
 *
 * Visual treatment (chat page redesign commit 1): a subtle borderless
 * pill — rounded-full, no fill at rest, the sentence-case full model
 * name ("Claude Sonnet 4.6") in the sans UI font, muted-fg text, with a
 * bg-hairline + foreground-text hover. Carries the polish #15 motion
 * tokens shared by the rail's interactive leaves (duration-release /
 * ease-release at base, duration-hover / ease-soft on hover) so it reads
 * as a quiet neutral control, not the mono-caps status chip it was. The
 * chevron rotates 180° when open via the same token vocabulary.
 *
 * Trigger shows the full model name; the menu items stay short-form
 * (`modelDisplayNameShort`) — a descriptive trigger over a compact list.
 */
const COMPOSER_MODEL_OPTIONS: ReadonlyArray<string> = COMPOSER_MODEL_IDS;

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
        className="group inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] text-muted-foreground transition-colors duration-release ease-release motion-reduce:transition-none hover:bg-hairline hover:text-foreground hover:duration-hover hover:ease-soft disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-label={`Model: ${modelDisplayName(model)}. Change model.`}
      >
        <span>{modelDisplayName(model)}</span>
        <ChevronDownIcon className="size-3 transition-transform duration-hover ease-soft motion-reduce:transition-none group-data-[popup-open]:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6}>
        {COMPOSER_MODEL_OPTIONS.map((value) => {
          const selected = value === model;
          return (
            <DropdownMenuItem
              key={value}
              onClick={() => handleSelect(value)}
              className="flex items-center justify-between gap-3 pr-2"
            >
              <span>{modelDisplayNameShort(value)}</span>
              {selected ? <CheckIcon className="size-3.5 text-primary" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
