"use client";

import { CheckIcon, CopyIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import {
  getDisplayLabelFromOrigin,
  parseSourceOrigin,
} from "@/lib/agents/source";
import type { LaunchpadAgent } from "@/lib/auth/access";
import { modelDisplayName } from "@/lib/llm/model-label";

/**
 * Slim attachment shape consumed by the panel's References section.
 * The launchpad page does a single parallel query against
 * `agent_attachments` for every visible agent and passes the map down;
 * the panel just looks up by id.
 */
export interface AgentAttachmentRow {
  originalFilename: string;
}

interface AgentDetailsPanelProps {
  /** When non-null the panel renders; null hides it. */
  agent: LaunchpadAgent | null;
  /** Attachments for the currently-open agent. Empty array = no refs. */
  attachments: AgentAttachmentRow[];
  /** Called on Escape, backdrop click, or X. */
  onClose: () => void;
}

/**
 * Read-only slide-over panel for Canonical and Claude-for-Legal agents.
 * Opens when a user clicks the Info icon on a Canonical or C4L card;
 * shows the agent's full settings (model, web search, export format,
 * attached references, system prompt, metadata) without granting any
 * edit affordances. Visible to admins and non-admins alike — the panel
 * is the only way for a non-admin to inspect what's inside an agent
 * without opening a chat.
 *
 * Personal agents do NOT use this panel (owners see everything in the
 * edit form; other users shouldn't peek into someone else's scratchpad).
 *
 * Built as a custom positioned overlay rather than the native `<dialog>`
 * element because the side-anchored slide-in interaction is awkward to
 * coax out of the native dialog's centered default. Focus management,
 * escape-to-close, and body-scroll-lock are wired manually below.
 */
export function AgentDetailsPanel({
  agent,
  attachments,
  onClose,
}: AgentDetailsPanelProps) {
  const [copied, setCopied] = useState(false);
  const [prevAgentId, setPrevAgentId] = useState<string | null>(
    agent?.id ?? null,
  );

  // Reset the copy-feedback state when switching between agents, using
  // React's "adjusting state during render" pattern instead of an
  // effect (per react-hooks/set-state-in-effect). The setStates here
  // schedule a re-render but skip committing the intermediate state.
  if (agent?.id !== prevAgentId) {
    setPrevAgentId(agent?.id ?? null);
    setCopied(false);
  }

  // Escape-to-close while open. Listener is attached only when open so
  // it doesn't compete with other components for the Escape key.
  useEffect(() => {
    if (!agent) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [agent, onClose]);

  // Body-scroll lock so background content doesn't shift behind the
  // overlay. Restores the prior overflow value on close.
  useEffect(() => {
    if (!agent) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [agent]);

  if (!agent) return null;

  const parsedSource =
    agent.source_origin !== null
      ? parseSourceOrigin(agent.source_origin)
      : null;
  const sourceLabel = parsedSource
    ? getDisplayLabelFromOrigin(agent.source_origin)
    : agent.is_template
      ? "Department Canonical"
      : null;
  const sourcePath = parsedSource
    ? `${parsedSource.plugin}/${parsedSource.skill}`
    : null;

  const tools = Array.isArray(agent.tools_enabled)
    ? (agent.tools_enabled as unknown as string[])
    : [];
  const webSearchEnabled = tools.includes("web_search");

  const exportFormat =
    agent.default_output_format === "docx"
      ? "Word document (.docx)"
      : "Markdown";

  const handleCopy = async () => {
    if (!agent.system_prompt) return;
    try {
      await navigator.clipboard.writeText(agent.system_prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable (e.g., insecure context). Leave the
      // button in its default state; users can still select + copy
      // the prompt text manually.
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close agent details"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-foreground/20"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-details-title"
        className="fixed inset-y-0 right-0 z-50 flex w-[480px] max-w-full flex-col overflow-hidden border-l border-border bg-background shadow-2xl animate-in slide-in-from-right duration-200"
      >
        <header className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-5">
          <div className="flex min-w-0 flex-col gap-1">
            <h2
              id="agent-details-title"
              className="text-xl font-semibold tracking-tight text-foreground"
            >
              {agent.name}
            </h2>
            {sourceLabel ? (
              <p className="truncate text-xs text-muted-foreground">
                {sourceLabel}
                {sourcePath ? (
                  <>
                    {" · "}
                    <span className="font-mono">{sourcePath}</span>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {agent.description ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {agent.description}
            </p>
          ) : null}

          <PanelSection heading="Configuration">
            <KVRow
              label="Model"
              value={modelDisplayName(agent.model) || "—"}
            />
            <KVRow
              label="Web search"
              value={webSearchEnabled ? "Enabled" : "Disabled"}
            />
            <KVRow label="Export format" value={exportFormat} />
          </PanelSection>

          <PanelSection heading="References">
            {attachments.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {attachments.map((att, i) => (
                  <li
                    key={`${att.originalFilename}-${i}`}
                    className="rounded-sm bg-muted/40 px-2 py-1 font-mono text-xs text-foreground"
                  >
                    {att.originalFilename}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No references attached.
              </p>
            )}
          </PanelSection>

          <PanelSection
            heading="System prompt"
            actions={
              agent.system_prompt ? (
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {copied ? (
                    <>
                      <CheckIcon className="h-3 w-3" /> Copied
                    </>
                  ) : (
                    <>
                      <CopyIcon className="h-3 w-3" /> Copy
                    </>
                  )}
                </button>
              ) : null
            }
          >
            <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground">
              {agent.system_prompt || "—"}
            </pre>
          </PanelSection>

          <PanelSection heading="Metadata">
            <KVRow label="Created" value={formatDate(agent.created_at)} />
            <KVRow
              label="Last updated"
              value={formatDate(agent.updated_at)}
            />
            <KVRow
              label="Created by"
              value={parsedSource ? sourceLabel ?? "System" : "System"}
            />
          </PanelSection>
        </div>
      </aside>
    </>
  );
}

function PanelSection({
  heading,
  actions,
  children,
}: {
  heading: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 first:mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {heading}
        </h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

function KVRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hairline/60 py-1.5 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}
