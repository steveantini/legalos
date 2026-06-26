"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { SchemaSuggestionReview } from "@/components/knowledge/schema-suggestion-review";
import { Button } from "@/components/ui/button";
import { suggestSchemaAttribute } from "@/lib/actions/schema-suggestions";
import type { SchemaSuggestionView } from "@/lib/knowledge/schema-suggestions-shared";
import type { PresentedGap } from "@/lib/knowledge/structured-query-shared";

/**
 * Schema-grows-on-demand, the entry point (phase two). When a question hits the
 * honest gap, this offers "want me to start tracking it?". A member suggests; a
 * model drafts the attribute; the draft is then shown via SchemaSuggestionReview
 * — editable-and-approvable inline for an approver (so an admin can add it on the
 * spot), or "awaiting approval" for a member. This is purely additive to the
 * commit-5 gap: the gap still names what IS tracked above this.
 */
export function GapSuggestionFlow({
  gap,
  collectionId,
}: {
  gap: PresentedGap;
  collectionId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [created, setCreated] = useState<SchemaSuggestionView | null>(null);

  function handleSuggest() {
    if (pending) return;
    start(async () => {
      const result = await suggestSchemaAttribute({
        collectionId,
        question: gap.question,
        missingConcept: gap.missingConcept,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setCreated(result.suggestion);
      router.refresh(); // the suggestion also joins the Suggested fields list
    });
  }

  if (created) {
    return (
      <div className="mt-4">
        <SchemaSuggestionReview suggestion={created} />
      </div>
    );
  }

  return (
    <div className="mt-4">
      <p className="text-[13px] leading-[1.5] text-muted-foreground">
        Want {gap.missingConcept} tracked? Suggest it as a new field, and it
        becomes a permanent, exact-queryable attribute once an administrator
        approves and the collection is updated.
      </p>
      <Button type="button" onClick={handleSuggest} disabled={pending} className="mt-2.5">
        {pending ? "Drafting…" : `Suggest tracking ${truncateConcept(gap.missingConcept)}`}
      </Button>
    </div>
  );
}

// Keep the button label tidy for a long concept.
function truncateConcept(concept: string): string {
  const trimmed = concept.trim();
  return trimmed.length > 40 ? `${trimmed.slice(0, 39)}…` : trimmed;
}
