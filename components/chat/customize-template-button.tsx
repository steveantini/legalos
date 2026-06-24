"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { forkAgentFromConversationAction } from "@/lib/actions/agents";

interface CustomizeTemplateButtonProps {
  agentId: string;
  /**
   * The active conversation id from ChatInterface state. May be null
   * (user is on an empty chat surface that hasn't sent its first turn).
   * Null → fresh fork with no message-history copy. Non-null → fork
   * plus a copy of the source conversation into the new agent.
   */
  conversationId: string | null;
  /**
   * Idle/pending button text. Defaults to Customize; the fully-locked legalOS
   * system tier passes "Copy"/"Copying…" since copying is the only way to adapt
   * one. The fork behavior is identical either way.
   */
  label?: string;
  pendingLabel?: string;
}

/**
 * "Customize this" affordance for a template's chat surface (Session 27,
 * Step A.2 Q3). Click invokes `forkAgentFromConversationAction` which
 * creates a user-owned copy of the template and — when a conversation
 * is active — copies its messages into a fresh conversation under the
 * new agent. On success, routes to the new agent's chat surface,
 * preserving the (optional) new conversation via the `?c=` param.
 *
 * useTransition gates the click so the button surfaces a pending state
 * while the server work runs. Failures surface as `toast.error`; the
 * action handles best-effort cleanup of orphaned agent rows server-
 * side, so the client doesn't need to do anything beyond surface the
 * error.
 */
export function CustomizeTemplateButton({
  agentId,
  conversationId,
  label = "Customize",
  pendingLabel = "Customizing…",
}: CustomizeTemplateButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("source_agent_id", agentId);
      if (conversationId) {
        formData.set("source_conversation_id", conversationId);
      }
      const result = await forkAgentFromConversationAction(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const target = result.newConversationId
        ? `/workspace/agents/${result.newAgentId}?c=${result.newConversationId}`
        : `/workspace/agents/${result.newAgentId}`;
      router.push(target);
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleClick}
      disabled={pending}
    >
      {pending ? pendingLabel : label}
    </Button>
  );
}
