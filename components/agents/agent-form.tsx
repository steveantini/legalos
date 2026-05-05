"use client";

import Link from "next/link";
import { useActionState } from "react";

import { AgentAttachmentsSection } from "@/components/agents/agent-attachments-section";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { AgentFormResult } from "@/lib/actions/agents";
import { modelDisplayName } from "@/lib/llm/model-label";

type ExistingAttachment = {
  attachmentId: string;
  storagePath: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  extractedText: string | null;
  extractionWarning: string | null;
};

/**
 * Models the bounded model dropdown is allowed to render. Kept in step
 * with MODEL_PRICING server-side; misalignment fails server validation.
 * The Zod schema in the server action is the trust boundary — this list
 * is UX, not a security gate.
 */
const MODEL_OPTIONS: { value: string; helper: string }[] = [
  {
    value: "anthropic/claude-sonnet-4-6",
    helper: "Fast, cost-effective. Good default for most tasks.",
  },
  {
    value: "anthropic/claude-opus-4-7",
    helper: "Slower, more capable. Best for hard reasoning.",
  },
  {
    value: "anthropic/claude-opus-4-6",
    helper: "Previous Opus generation. Use only if a workflow requires it.",
  },
  {
    value: "anthropic/claude-haiku-4-5-20251001",
    helper: "Fastest, cheapest. Good for simple tasks at high volume.",
  },
];

interface AgentFormDefaults {
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
  /**
   * Tool ids to start enabled. Forks inherit from the source template;
   * fresh from-scratch agents start with an empty array; edit mode
   * loads the agent's current tools_enabled column.
   */
  toolsEnabled: string[];
}

type AgentFormAction = (
  state: AgentFormResult,
  formData: FormData,
) => Promise<AgentFormResult>;

interface AgentFormProps {
  /**
   * Drives the submit-button label and where Cancel returns to. Create
   * mode (with or without a fork source) returns to the department page;
   * edit mode returns to the agent's chat surface.
   */
  mode: "create" | "edit";
  defaults: AgentFormDefaults;
  /**
   * The agent's department slug. In create mode this is required for the
   * server action; in edit mode it's only used by Cancel as a fallback if
   * the agent's chat surface is unreachable for any reason.
   */
  departmentSlug: string;
  /**
   * When set, renders the "Forked from <name>" indicator and submits a
   * hidden forked_from_agent_id input. Only meaningful in create mode.
   */
  forkedFromAgent: { id: string; name: string } | null;
  /**
   * Agent UUID. Required in BOTH modes — in create mode it's pre-allocated
   * client-side so attachments can upload to <user_id>/<agent_id>/...
   * before the agent row exists; in edit mode it's the existing row's id.
   */
  agentId: string;
  /**
   * Existing attachments (edit mode only — create mode receives []).
   * Drives auto-expand of the Advanced section per 8h plan Q5.
   */
  existingAttachments: ExistingAttachment[];
  /**
   * The server action this form binds to via useActionState. The page
   * passes createAgentAction or updateAgentAction depending on mode.
   */
  action: AgentFormAction;
}

const initialState: AgentFormResult = { ok: true };

export function AgentForm({
  mode,
  defaults,
  departmentSlug,
  forkedFromAgent,
  agentId,
  existingAttachments,
  action,
}: AgentFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  const fieldError = (
    field: keyof NonNullable<
      Extract<AgentFormResult, { ok: false }>["fieldErrors"]
    >,
  ) => (state.ok === false ? state.fieldErrors?.[field] : undefined);

  const cancelHref =
    mode === "edit"
      ? `/agents/${agentId}`
      : `/departments/${departmentSlug}`;
  const submitLabelIdle = mode === "edit" ? "Save changes" : "Save agent";
  const submitLabelPending = mode === "edit" ? "Saving…" : "Saving…";

  return (
    <form action={formAction} className="space-y-8">
      <input type="hidden" name="agent_id" value={agentId} />
      {mode === "create" ? (
        <input type="hidden" name="department_slug" value={departmentSlug} />
      ) : null}
      {forkedFromAgent ? (
        <input
          type="hidden"
          name="forked_from_agent_id"
          value={forkedFromAgent.id}
        />
      ) : null}

      {forkedFromAgent ? (
        <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Forked from </span>
          <span className="font-medium">{forkedFromAgent.name}</span>
          <span className="text-muted-foreground">
            {" "}
            — review the fields below and adjust before saving.
          </span>
        </div>
      ) : null}

      {state.ok === false && state.formError ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {state.formError}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="agent-name">Name</Label>
        <Input
          id="agent-name"
          name="name"
          maxLength={120}
          defaultValue={defaults.name}
          aria-invalid={Boolean(fieldError("name"))}
          aria-describedby={fieldError("name") ? "agent-name-error" : undefined}
          className="bg-card"
        />
        {fieldError("name") ? (
          <p id="agent-name-error" className="text-sm text-destructive">
            {fieldError("name")}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Shown on the launchpad card and the chat header.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="agent-description">Description</Label>
        <Input
          id="agent-description"
          name="description"
          maxLength={500}
          defaultValue={defaults.description}
          aria-invalid={Boolean(fieldError("description"))}
          aria-describedby={
            fieldError("description") ? "agent-description-error" : undefined
          }
          className="bg-card"
        />
        {fieldError("description") ? (
          <p
            id="agent-description-error"
            className="text-sm text-destructive"
          >
            {fieldError("description")}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            One short sentence so you remember what this agent does. Optional.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="agent-model">Model</Label>
        <Select name="model" defaultValue={defaults.model}>
          <SelectTrigger id="agent-model" className="w-full bg-card">
            <SelectValue placeholder="Select a model" />
          </SelectTrigger>
          <SelectContent>
            {MODEL_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex flex-col">
                  <span>{modelDisplayName(option.value)}</span>
                  <span className="text-xs text-muted-foreground">
                    {option.helper}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fieldError("model") ? (
          <p className="text-sm text-destructive">{fieldError("model")}</p>
        ) : null}
      </div>

      <div
        id="web-search"
        className="flex scroll-mt-8 items-start justify-between gap-3"
      >
        <div className="space-y-1">
          <Label htmlFor="tool-web-search" className="text-sm font-medium">
            Web search
          </Label>
          <p className="text-sm text-muted-foreground">
            Allows the agent to search the web for current information. Each
            search costs $0.01 in addition to the model&rsquo;s token charges.
          </p>
        </div>
        <Switch
          id="tool-web-search"
          name="tool_web_search"
          defaultChecked={defaults.toolsEnabled.includes("web_search")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="agent-system-prompt">System prompt</Label>
        <Textarea
          id="agent-system-prompt"
          name="system_prompt"
          rows={10}
          maxLength={20000}
          defaultValue={defaults.systemPrompt}
          aria-invalid={Boolean(fieldError("system_prompt"))}
          aria-describedby={
            fieldError("system_prompt")
              ? "agent-system-prompt-error"
              : "agent-system-prompt-helper"
          }
          className="min-h-[220px] bg-card font-mono text-sm"
        />
        {fieldError("system_prompt") ? (
          <p
            id="agent-system-prompt-error"
            className="text-sm text-destructive"
          >
            {fieldError("system_prompt")}
          </p>
        ) : (
          <p
            id="agent-system-prompt-helper"
            className="text-sm text-muted-foreground"
          >
            Instructions sent to the model on every turn. Be specific about role,
            tone, and what to avoid.
          </p>
        )}
      </div>

      <AgentAttachmentsSection
        mode={mode}
        agentId={agentId}
        initialAttachments={existingAttachments.map((a) => ({
          attachmentId: a.attachmentId,
          storagePath: a.storagePath,
          originalFilename: a.originalFilename,
          contentType: a.contentType,
          sizeBytes: a.sizeBytes,
          extractedText: a.extractedText,
          extractionWarning: a.extractionWarning,
        }))}
      />

      <p className="text-sm text-muted-foreground">
        Export to Word, Google Docs, and more &mdash; coming soon.
      </p>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-6">
        <Link href={cancelHref} className={buttonVariants({ variant: "ghost" })}>
          Cancel
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? submitLabelPending : submitLabelIdle}
        </Button>
      </div>
    </form>
  );
}
