"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateResearchDocumentCap } from "@/lib/actions/research";

/**
 * The Research governance control in Policy & access (Knowledge arc Step 2):
 * the per-run document cap. One honest lever: how many documents a single
 * research run may read. Over-cap scopes are declined before running with a
 * message naming this setting — never silently truncated — so the admin
 * decides the ceiling, not the engine. Super-admin-interactive, read-only
 * for other admins (the established pattern).
 */
export function ResearchCapEditor({
  initialCap,
  canEdit,
}: {
  initialCap: number;
  canEdit: boolean;
}) {
  const [value, setValue] = useState(String(initialCap));
  const [savedCap, setSavedCap] = useState(initialCap);
  const [pending, startTransition] = useTransition();

  const parsed = Number.parseInt(value, 10);
  const valid = Number.isFinite(parsed) && parsed >= 1 && parsed <= 5000;
  const dirty = valid && parsed !== savedCap;

  function handleSave() {
    if (!dirty || pending) return;
    startTransition(async () => {
      const result = await updateResearchDocumentCap({ cap: parsed });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSavedCap(parsed);
      toast.success("Research cap saved.");
    });
  }

  return (
    <section aria-labelledby="policy-research" className="mt-12">
      <h2
        id="policy-research"
        className="text-[17px] font-medium tracking-[-0.005em] text-foreground"
      >
        Research
      </h2>
      <p className="mt-1.5 max-w-[70ch] text-[13px] leading-[1.5] text-muted-foreground">
        How many documents one research run may read. A larger scope is
        declined before it runs, with this cap named, so cost stays a
        deliberate choice.
      </p>

      <div className="mt-4 flex items-center gap-3 rounded-lg bg-paper-2 px-5 py-3">
        <label
          htmlFor="research-document-cap"
          className="text-[13.5px] font-medium text-foreground"
        >
          Documents per run
        </label>
        {canEdit ? (
          <>
            <Input
              id="research-document-cap"
              type="number"
              inputMode="numeric"
              min={1}
              max={5000}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="w-[110px] bg-background"
              aria-invalid={!valid || undefined}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={!dirty || pending}
            >
              {pending ? "Saving…" : "Save"}
            </Button>
            {!valid ? (
              <p className="text-[12.5px] text-destructive">
                Enter a number between 1 and 5000.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-[13.5px] text-foreground">{savedCap}</p>
        )}
      </div>
    </section>
  );
}
