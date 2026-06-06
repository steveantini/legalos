"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { forkWorkflowTemplate } from "@/lib/actions/workflows";

/**
 * "Use this template" (Workflows arc Step 5): forks the template into a new
 * user-owned draft and lands in the builder, where it is immediately
 * editable. The fork happens server-side through the same validated authoring
 * path as composing by hand; a failure (for example, the template's agent is
 * no longer available) reads back honestly.
 */
export function UseTemplateButton({
  templateId,
  templateName,
}: {
  templateId: string;
  templateName: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [forking, setForking] = useState(false);

  function useTemplate() {
    if (forking) return;
    setForking(true);
    startTransition(async () => {
      const res = await forkWorkflowTemplate(templateId);
      if (res.ok) {
        toast.success("Workflow created from the template. It's yours to edit.");
        router.push(`/workspace/workflows/my-workflows/${res.id}/edit`);
        router.refresh();
        return;
      }
      setForking(false);
      toast.error(
        res.errors?.join(" ") ??
          res.error ??
          "The template couldn't be used. Try again.",
      );
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      onClick={useTemplate}
      disabled={forking}
      aria-label={`Use the ${templateName} template`}
    >
      {forking ? "Creating…" : "Use this template"}
    </Button>
  );
}
