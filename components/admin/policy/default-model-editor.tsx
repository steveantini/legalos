"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateDefaultModelAction } from "@/lib/actions/default-model";
import { modelDisplayName } from "@/lib/llm/model-label";
import { DEFAULT_MODEL_FALLBACK, MODELS } from "@/lib/llm/models";

/**
 * The org default-model control (admin Policy & access, A2b) — a third
 * governance control alongside the connection-policy ceiling and allowed
 * categories. Sets the model NEW agents start with; it does not change existing
 * agents or running conversations.
 *
 * Options come from the canonical models source (lib/llm/models.ts), the same
 * list the agent pickers and validation use — the future models-as-a-connection
 * seam — never a local array. Super admins (`canEdit`) get an interactive picker
 * with the established admin idiom: optimistic update in a transition, revert and
 * `toast.error` on failure, a quiet `toast.success` on save. Every other admin
 * sees the effective model rendered read only.
 *
 * Honest framing when unset: until a super admin chooses one, the system default
 * (Opus 4.8, DEFAULT_MODEL_FALLBACK) is in effect, and the control says so. After
 * a successful save the value is explicit and the note drops away.
 */
export function DefaultModelEditor({
  currentModelId,
  canEdit,
}: {
  currentModelId: string | null;
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  // The effective model is the stored org default, or the system fallback when
  // none is set. `hasExplicitValue` tracks whether the org has actually chosen
  // one, so the "system default until you choose" note shows only when unset.
  const [selected, setSelected] = useState(
    currentModelId ?? DEFAULT_MODEL_FALLBACK,
  );
  const [hasExplicitValue, setHasExplicitValue] = useState(
    currentModelId !== null,
  );

  function handleSelect(nextModel: string | null) {
    if (!nextModel || !canEdit || pending || nextModel === selected) return;
    const previousSelected = selected;
    const previousHadValue = hasExplicitValue;
    setSelected(nextModel);
    setHasExplicitValue(true);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("model", nextModel);

      const result = await updateDefaultModelAction(formData);
      if (!result.ok) {
        setSelected(previousSelected);
        setHasExplicitValue(previousHadValue);
        toast.error(result.error);
        return;
      }
      toast.success("Default model updated.");
    });
  }

  return (
    <section aria-labelledby="policy-default-model" className="mt-12">
      <h2
        id="policy-default-model"
        className="text-[17px] font-medium tracking-[-0.005em] text-foreground"
      >
        Default model
      </h2>
      <p className="mt-1.5 max-w-[70ch] text-[13px] leading-[1.5] text-muted-foreground">
        The model new agents start with. It sets only the starting point; it does
        not change existing agents or running conversations.
      </p>

      <div className="mt-4 max-w-[420px]">
        {canEdit ? (
          <Select
            value={selected}
            onValueChange={handleSelect}
            disabled={pending}
          >
            <SelectTrigger
              className="w-full bg-paper-2"
              aria-label="Default model for new agents"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  <div className="flex flex-col">
                    <span>{model.displayName}</span>
                    <span className="text-xs text-muted-foreground">
                      {model.helper}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-[15px] font-medium text-foreground">
            {modelDisplayName(selected)}
          </p>
        )}
      </div>

      <p className="mt-3 max-w-[70ch] text-[13px] leading-[1.5] text-caption">
        {hasExplicitValue
          ? "New agents will start on this model. You can change it per agent at any time."
          : `${modelDisplayName(DEFAULT_MODEL_FALLBACK)} is the system default until you choose another.`}
      </p>

      {!canEdit ? (
        <p className="mt-3 text-[13px] leading-[1.5] text-caption">
          Only super admins can change the default model. You’re viewing it as
          read only.
        </p>
      ) : null}
    </section>
  );
}
