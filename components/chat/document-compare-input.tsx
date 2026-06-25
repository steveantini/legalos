"use client";

import { useRef } from "react";

import { UploadIcon } from "lucide-react";

import { AttachmentChip } from "./attachment-chip";

import type { CompareRole } from "@/lib/agents/pre-steps/document-compare";
import type { PendingAttachment } from "@/lib/chat/pending-attachment";

/** Upload allowlist, mirrored from the generic attach button and the server. */
const ACCEPT = ".pdf,.docx,.txt,.md,.xlsx";

type SlotDef = { role: CompareRole; label: string; hint: string };

/**
 * The two role slots, in reading order. "Original" is the earlier version,
 * "Revised" the newer one to compare against it; the labels make the roles
 * explicit so the comparison no longer depends on attachment order (D-188).
 */
const SLOTS: readonly SlotDef[] = [
  { role: "original", label: "Original", hint: "The earlier version" },
  { role: "revised", label: "Revised", hint: "The newer version" },
];

type DocumentCompareInputProps = {
  pendingAttachments: PendingAttachment[];
  /** Upload one file into the given role slot (replaces whatever is there). */
  onAttachForRole: (files: File[], role: CompareRole) => void;
  onRemoveAttachment: (localId: string) => void;
  disabled: boolean;
};

/**
 * The Document Comparison agent's purpose-built composer input: two explicitly
 * labeled slots, "Original" and "Revised", in place of the generic attachment
 * affordance. Each slot holds one document; the role travels with the attachment
 * through the send payload to the deterministic pre-step, which reads documents by
 * role rather than position. Rendered only for an agent that declares the
 * document-compare pre-step (the locked built-in and any fork of it); every other
 * agent keeps the ordinary attachment input. Reuses the existing upload pipeline
 * and the shared AttachmentChip.
 */
export function DocumentCompareInput({
  pendingAttachments,
  onAttachForRole,
  onRemoveAttachment,
  disabled,
}: DocumentCompareInputProps) {
  return (
    <div className="grid grid-cols-1 gap-2 px-3 pt-3 sm:grid-cols-2">
      {SLOTS.map((slot) => (
        <CompareSlot
          key={slot.role}
          slot={slot}
          attachment={
            pendingAttachments.find((p) => p.compareRole === slot.role) ?? null
          }
          onAttach={(files) => onAttachForRole(files, slot.role)}
          onRemove={onRemoveAttachment}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function CompareSlot({
  slot,
  attachment,
  onAttach,
  onRemove,
  disabled,
}: {
  slot: SlotDef;
  attachment: PendingAttachment | null;
  onAttach: (files: File[]) => void;
  onRemove: (localId: string) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    // One document per slot; ignore any extras a multi-select might surface.
    if (files.length > 0) onAttach(files.slice(0, 1));
    // Reset so re-selecting the same filename still fires onChange.
    e.target.value = "";
  }

  return (
    <div className="rounded-lg border border-hairline bg-muted/30 p-2.5">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{slot.label}</span>
        <span className="text-[11px] text-caption">{slot.hint}</span>
      </div>
      {attachment ? (
        <AttachmentChip
          attachment={attachment}
          onRemove={() => onRemove(attachment.localId)}
        />
      ) : (
        <>
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border-strong px-2.5 py-1.5 text-sm text-muted-foreground transition-colors duration-release ease-release motion-reduce:transition-none hover:text-foreground hover:duration-hover hover:ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <UploadIcon className="size-3.5" aria-hidden />
            Add {slot.label.toLowerCase()}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={handleChange}
          />
        </>
      )}
    </div>
  );
}
