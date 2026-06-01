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
import { MODELS } from "@/lib/llm/models";

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
 * The full model picker's options, derived from the canonical models source
 * (lib/llm/models.ts) in its display order (flagship first). The Zod schema in
 * the server action validates against the same source, so this list is UX, not
 * a security gate, and can never drift from what the server accepts.
 */
const MODEL_OPTIONS = MODELS.map((model) => ({
  value: model.id,
  helper: model.helper,
}));

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
  /**
   * The agent's `source_origin` column when in edit mode (null for
   * create mode, native canonical templates, and personal agents).
   * When non-null in edit mode the form enters C4L-edit treatment:
   * name, description, system prompt, and web-search toggle render as
   * read-only with a "Managed by Claude for Legal" hint; model,
   * attachments, and export format stay editable. A banner at the top
   * sets expectations before the user scrolls into a locked field.
   *
   * The visual lock is paired with server-side enforcement in
   * `updateAgentAction` — a determined caller cannot mutate locked
   * fields by stripping the readOnly attribute in devtools.
   */
  sourceOrigin?: string | null;
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
  sourceOrigin,
}: AgentFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  const fieldError = (
    field: keyof NonNullable<
      Extract<AgentFormResult, { ok: false }>["fieldErrors"]
    >,
  ) => (state.ok === false ? state.fieldErrors?.[field] : undefined);

  // C4L-edit treatment: name, description, system prompt, and web-search
  // are read-only and surface a "managed upstream" hint; model,
  // attachments, and export format remain editable. Only meaningful in
  // edit mode — create flows never carry a source_origin.
  const isC4LEdit = mode === "edit" && !!sourceOrigin;
  const lockedHint = "Managed by Claude for Legal.";
  const lockedFieldClass = isC4LEdit ? "bg-muted/40 text-muted-foreground" : "bg-card";

  const cancelHref =
    mode === "edit"
      ? `/workspace/agents/${agentId}`
      : `/workspace/departments/${departmentSlug}`;
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

      {isC4LEdit ? (
        <div
          role="note"
          className="rounded-md border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground"
        >
          This agent is curated by Claude for Legal. You can adjust its
          model, attached references, and export format. Other fields are
          managed upstream.
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
          readOnly={isC4LEdit}
          aria-readonly={isC4LEdit || undefined}
          aria-invalid={Boolean(fieldError("name"))}
          aria-describedby={fieldError("name") ? "agent-name-error" : undefined}
          className={lockedFieldClass}
        />
        {fieldError("name") ? (
          <p id="agent-name-error" className="text-sm text-destructive">
            {fieldError("name")}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {isC4LEdit ? lockedHint : "Shown on the launchpad card and the chat header."}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="agent-description">Description</Label>
        <Textarea
          id="agent-description"
          name="description"
          rows={2}
          maxLength={500}
          defaultValue={defaults.description}
          readOnly={isC4LEdit}
          aria-readonly={isC4LEdit || undefined}
          aria-invalid={Boolean(fieldError("description"))}
          aria-describedby={
            fieldError("description") ? "agent-description-error" : undefined
          }
          className={lockedFieldClass}
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
            {isC4LEdit
              ? lockedHint
              : "One short sentence so you remember what this agent does. Optional."}
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
            {isC4LEdit
              ? lockedHint
              : "Allows the agent to search the web for current information. Each search costs $0.01 in addition to the model’s token charges."}
          </p>
        </div>
        {isC4LEdit ? (
          <>
            {/* Visual lock: the Switch renders disabled (no `name`, no
                submit) while a hidden input named tool_web_search carries
                the current value through the form submission. The server
                action compares submitted vs. DB and rejects mismatches. */}
            <Switch
              id="tool-web-search"
              disabled
              defaultChecked={defaults.toolsEnabled.includes("web_search")}
              aria-readonly
            />
            <input
              type="hidden"
              name="tool_web_search"
              value={defaults.toolsEnabled.includes("web_search") ? "on" : ""}
            />
          </>
        ) : (
          <Switch
            id="tool-web-search"
            name="tool_web_search"
            defaultChecked={defaults.toolsEnabled.includes("web_search")}
          />
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="agent-system-prompt">System prompt</Label>
        <Textarea
          id="agent-system-prompt"
          name="system_prompt"
          rows={10}
          maxLength={20000}
          defaultValue={defaults.systemPrompt}
          readOnly={isC4LEdit}
          aria-readonly={isC4LEdit || undefined}
          aria-invalid={Boolean(fieldError("system_prompt"))}
          aria-describedby={
            fieldError("system_prompt")
              ? "agent-system-prompt-error"
              : "agent-system-prompt-helper"
          }
          className={`min-h-[220px] ${lockedFieldClass}`}
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
            {isC4LEdit
              ? lockedHint
              : "Instructions sent to the model on every turn. Be specific about role, tone, and what to avoid."}
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
