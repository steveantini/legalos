"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  approveSchemaSuggestion,
  rejectSchemaSuggestion,
} from "@/lib/actions/schema-suggestions";
import {
  COLLECTION_ATTRIBUTE_TYPES,
  type CollectionAttributeType,
} from "@/lib/knowledge/collection-schema";
import type {
  ProposedAttribute,
  SchemaSuggestionView,
} from "@/lib/knowledge/schema-suggestions-shared";

/**
 * One suggested attribute, rendered per the viewer's role (schema-grows-on-demand,
 * phase two). An APPROVER sees the model's draft fully EDITABLE (label, type,
 * options, and especially the load-bearing description) and can Approve or
 * Reject; nothing is added until they confirm. A non-approver sees the proposal
 * read-only with "awaiting approval". An approved suggestion shows the loop-close
 * note. Self-contained: it owns the resolve actions and refresh, so both the gap
 * flow and the suggested-fields list just render it.
 */

const TYPE_LABELS: Record<CollectionAttributeType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  boolean: "Yes / no",
  enum: "One of a set",
};

export function SchemaSuggestionReview({
  suggestion,
}: {
  suggestion: SchemaSuggestionView;
}) {
  const router = useRouter();
  const labelId = useId();
  const typeId = useId();
  const optionsId = useId();
  const descriptionId = useId();
  const [pending, start] = useTransition();

  const [label, setLabel] = useState(suggestion.proposed.label);
  const [type, setType] = useState<CollectionAttributeType>(suggestion.proposed.type);
  const [description, setDescription] = useState(suggestion.proposed.description);
  const [optionsText, setOptionsText] = useState(
    (suggestion.proposed.options ?? []).join("\n"),
  );

  function handleApprove() {
    if (pending) return;
    const options =
      type === "enum"
        ? optionsText
            .split("\n")
            .map((o) => o.trim())
            .filter((o) => o.length > 0)
        : undefined;
    const proposed: ProposedAttribute = {
      label: label.trim(),
      type,
      description: description.trim(),
      ...(options && options.length > 0 ? { options } : {}),
    };
    start(async () => {
      const result = await approveSchemaSuggestion({
        suggestionId: suggestion.id,
        proposed,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Added "${result.attributeLabel ?? label.trim()}". Run Update in Collections to extract it, then ask again.`,
      );
      router.refresh();
    });
  }

  function handleReject() {
    if (pending) return;
    start(async () => {
      const result = await rejectSchemaSuggestion(suggestion.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Suggestion dismissed.");
      router.refresh();
    });
  }

  if (suggestion.status === "approved") {
    return (
      <div className="rounded-lg border border-hairline bg-paper-2 px-4 py-3">
        <p className="text-[13px] leading-[1.5] text-foreground">
          Now tracked as{" "}
          <span className="font-medium">{suggestion.resultingAttributeLabel}</span>.
          An administrator can run Update in Collections to extract it, then your
          question can be answered.
        </p>
      </div>
    );
  }

  // Pending, but the viewer cannot approve: show the proposal read-only.
  if (!suggestion.canApprove) {
    return (
      <div className="rounded-lg border border-hairline bg-paper-2 px-4 py-3">
        <p className="text-[13px] leading-[1.5] text-foreground">
          Suggested:{" "}
          <span className="font-medium">{suggestion.proposed.label}</span>{" "}
          <span className="text-muted-foreground">
            ({TYPE_LABELS[suggestion.proposed.type]})
          </span>
        </p>
        <p className="mt-1 text-[12.5px] leading-[1.5] text-caption">
          {suggestion.proposed.description}
        </p>
        <p className="mt-2 text-[12px] font-medium text-muted-foreground">
          Awaiting an administrator&rsquo;s approval.
        </p>
      </div>
    );
  }

  // Pending, viewer can approve: the editable draft.
  return (
    <div className="rounded-lg border border-hairline bg-paper-2 px-4 py-3.5">
      <p className="text-[12px] font-medium text-muted-foreground">
        Review the suggested field before adding it. You own the final wording.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={labelId} className="text-[12px] font-medium text-foreground">
            Name
          </label>
          <input
            id={labelId}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={80}
            className="rounded-md border border-hairline bg-card px-3 py-1.5 text-[13.5px] text-foreground outline-none focus-visible:border-hairline-strong"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={typeId} className="text-[12px] font-medium text-foreground">
            Type
          </label>
          <select
            id={typeId}
            value={type}
            onChange={(e) => setType(e.target.value as CollectionAttributeType)}
            className="rounded-md border border-hairline bg-card px-3 py-1.5 text-[13.5px] text-foreground outline-none focus-visible:border-hairline-strong"
          >
            {COLLECTION_ATTRIBUTE_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        {type === "enum" ? (
          <div className="flex flex-col gap-1">
            <label htmlFor={optionsId} className="text-[12px] font-medium text-foreground">
              Options (one per line)
            </label>
            <textarea
              id={optionsId}
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              rows={3}
              className="resize-y rounded-md border border-hairline bg-card px-3 py-1.5 text-[13.5px] text-foreground outline-none focus-visible:border-hairline-strong"
            />
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <label htmlFor={descriptionId} className="text-[12px] font-medium text-foreground">
            What to extract (this is what the extractor follows)
          </label>
          <textarea
            id={descriptionId}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={500}
            className="resize-y rounded-md border border-hairline bg-card px-3 py-1.5 text-[13.5px] leading-[1.5] text-foreground outline-none focus-visible:border-hairline-strong"
          />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          onClick={handleApprove}
          disabled={pending || label.trim().length === 0 || description.trim().length === 0}
        >
          {pending ? "Adding…" : "Approve and add"}
        </Button>
        <Button type="button" variant="ghost" onClick={handleReject} disabled={pending}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
