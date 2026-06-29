"use client";

import { useId, useState } from "react";

import { CollectionScopeCard } from "@/components/knowledge/collection-scope-card";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/workspace/collapsible-section";
import type { QueryFolder } from "@/lib/knowledge/document-kinds";
import {
  QUESTION_MAX_LENGTH,
  QUESTION_MIN_LENGTH,
  type QueryableAttribute,
} from "@/lib/knowledge/structured-query-shared";

/**
 * The Structured Query ask composer (Step 3b), a deliberate SIBLING of the
 * Research composer: the QUESTION IS THE HERO, with folder scope as supporting
 * cast. Folder-picking is the scoping act (members pick from available folders;
 * admins can add more from a connected drive). The picked folders resolve to a
 * document KIND in the view above this; when one set-up, prepared kind is
 * resolved, this composer enables the ask and shows the fields you can ask about.
 * When the picks don't resolve to one askable kind, the Ask button stays disabled
 * and the view renders the next step (choose a kind, or set one up) below.
 */

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function StructuredQueryComposer({
  folders,
  selected,
  onToggle,
  onAddFolders,
  askSchemaId,
  askKindName,
  askFields,
  pending,
  onRun,
  initialQuestion = "",
}: {
  folders: QueryFolder[];
  /** Controlled selection (owned by the view, so picked folders auto-select). */
  selected: string[];
  onToggle: (id: string) => void;
  /** Admin-only: open the folder picker to add new folders. Omitted for members. */
  onAddFolders?: () => void;
  /** The resolved askable kind's schema id, or null when the ask isn't ready. */
  askSchemaId: string | null;
  askKindName: string | null;
  askFields: QueryableAttribute[];
  pending: boolean;
  onRun: (question: string, schemaId: string) => void;
  initialQuestion?: string;
}) {
  const questionId = useId();
  const [question, setQuestion] = useState(initialQuestion);
  // The composer initializes from props on mount; the surface unmounts it while
  // an answer is shown, so an "adjust" prefill is adopted on the next mount with
  // no effect needed.

  const canRun =
    question.trim().length >= QUESTION_MIN_LENGTH && askSchemaId !== null && !pending;

  const scopeSummary = askSchemaId
    ? `Asking over ${askKindName} · ${askFields.length} ${
        askFields.length === 1 ? "field" : "fields"
      }.`
    : selected.length > 0
      ? "Choose the document kind to ask, below."
      : "Pick folders to ask over.";

  return (
    <div className="flex flex-col gap-6">
      {/* The hero question. */}
      <div className="rounded-xl border border-hairline bg-paper-2 transition-colors duration-release ease-release focus-within:border-hairline-strong motion-reduce:transition-none">
        <label htmlFor={questionId} className="sr-only">
          Your question
        </label>
        <textarea
          id={questionId}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="How many agreements expire in 2026?"
          rows={3}
          maxLength={QUESTION_MAX_LENGTH}
          className="block w-full resize-none bg-transparent px-5 pt-4 text-[16px] leading-[1.55] text-foreground outline-none placeholder:text-muted-foreground/70 field-sizing-content min-h-[5.2em] max-h-[12em]"
        />
        <div className="flex items-center justify-end px-5 pb-3.5 pt-1">
          <Button
            type="button"
            onClick={() => canRun && askSchemaId && onRun(question.trim(), askSchemaId)}
            disabled={!canRun}
          >
            {pending ? "Asking…" : "Ask"}
          </Button>
        </div>
      </div>

      {/* Supporting cast: the folders to ask over, as the launchpad's collapsible
          scope section. The subline is the live summary; once the picks resolve
          to one prepared kind, it states the kind and how many fields it tracks. */}
      <CollapsibleSection
        title="Folders"
        sectionKey="structured-query-scope"
        defaultCollapsed={false}
        description={<span aria-live="polite">{scopeSummary}</span>}
      >
        <div className="flex flex-col gap-2">
          {folders.map((folder) => (
            <CollectionScopeCard
              key={folder.id}
              name={folder.name}
              documentCount={folder.documentCount}
              provenance={folder.provenance}
              fields={folder.attributes.map((attribute) => attribute.label)}
              selected={selected.includes(folder.id)}
              onSelect={() => onToggle(folder.id)}
              inputType="checkbox"
              title={
                folder.lastSyncedAt
                  ? `Synced ${relativeTime(folder.lastSyncedAt)}`
                  : "Not synced yet"
              }
            />
          ))}
          {folders.length === 0 ? (
            <p className="rounded-lg bg-paper-2 px-4 py-3 text-[13px] leading-[1.5] text-muted-foreground">
              {onAddFolders
                ? "No folders yet. Add folders from a connected drive to ask over them."
                : "No folders are available to you yet. An administrator can set up folders your team can ask over."}
            </p>
          ) : null}
          {onAddFolders ? (
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onAddFolders}
                disabled={pending}
              >
                Add folders from a drive
              </Button>
            </div>
          ) : null}
        </div>
      </CollapsibleSection>
    </div>
  );
}
