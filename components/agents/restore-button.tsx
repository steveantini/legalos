"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { restoreAgentAction } from "@/lib/actions/agents";
import { Button } from "@/components/ui/button";

interface RestoreButtonProps {
  agentId: string;
}

/**
 * Trash-page Restore button. Wraps restoreAgentAction in a useTransition
 * so failures (past 30-day window, RLS rejection) surface as a toast
 * instead of silently no-oping. Successful restores fall through to the
 * server action's revalidatePath, which removes the row from the list on
 * the next render.
 */
export function RestoreButton({ agentId }: RestoreButtonProps) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("agent_id", agentId);
      const result = await restoreAgentAction(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Restored.");
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={pending}
    >
      {pending ? "Restoring…" : "Restore"}
    </Button>
  );
}
