"use client";

import { AlertTriangleIcon, PaperclipIcon, XIcon } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addAttachmentAction,
  removeAttachmentAction,
  removeAttachmentDraftAction,
  uploadAttachmentDraftAction,
} from "@/lib/actions/attachments";
import type { AttachmentMetadata } from "@/lib/actions/_attachment-shared";

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;
const ACCEPT_MIME =
  ".pdf,.docx,.txt,.md,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** A row in the attachments list — covers both bound (existing) and draft (just-uploaded) entries. */
type Row = {
  /**
   * Attachment id in the DB. Null for create-mode drafts (the row hasn't
   * been inserted yet — atomic insert happens at form save).
   */
  attachmentId: string | null;
  storagePath: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  extractedText: string | null;
  extractionWarning: string | null;
};

interface AgentAttachmentsSectionProps {
  mode: "create" | "edit";
  agentId: string;
  initialAttachments: Row[];
}

export function AgentAttachmentsSection({
  mode,
  agentId,
  initialAttachments,
}: AgentAttachmentsSectionProps) {
  const [rows, setRows] = useState<Row[]>(initialAttachments);
  const [uploading, setUploading] = useState(false);
  const [removingRow, setRemovingRow] = useState<Row | null>(null);
  const [removePending, startRemoveTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const atCapacity = rows.length >= MAX_ATTACHMENTS;

  function metadataToRow(
    attachmentId: string | null,
    meta: AttachmentMetadata,
  ): Row {
    return {
      attachmentId,
      storagePath: meta.storagePath,
      originalFilename: meta.originalFilename,
      contentType: meta.contentType,
      sizeBytes: meta.sizeBytes,
      extractedText: meta.extractedText,
      extractionWarning: meta.extractionWarning,
    };
  }

  async function handleFileChosen(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error("File is larger than 20MB.");
      return;
    }
    if (rows.length >= MAX_ATTACHMENTS) {
      toast.error(`An agent can have at most ${MAX_ATTACHMENTS} attachments.`);
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("agent_id", agentId);
      formData.set("file", file);

      if (mode === "create") {
        const result = await uploadAttachmentDraftAction(formData);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setRows((prev) => [...prev, metadataToRow(null, result.attachment)]);
      } else {
        const result = await addAttachmentAction(formData);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setRows((prev) => [
          ...prev,
          metadataToRow(result.attachmentId, result.metadata),
        ]);
      }
    } finally {
      setUploading(false);
    }
  }

  function onPickFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void handleFileChosen(file);
    }
    event.target.value = "";
  }

  function confirmRemove(row: Row) {
    setRemovingRow(row);
  }

  function handleRemove() {
    if (!removingRow) return;
    const target = removingRow;
    startRemoveTransition(async () => {
      const formData = new FormData();
      let result: { ok: true } | { ok: false; error: string };
      if (target.attachmentId) {
        formData.set("attachment_id", target.attachmentId);
        result = await removeAttachmentAction(formData);
      } else {
        formData.set("storage_path", target.storagePath);
        result = await removeAttachmentDraftAction(formData);
      }
      if (!result.ok) {
        toast.error(result.error);
        setRemovingRow(null);
        return;
      }
      setRows((prev) =>
        prev.filter((r) => r.storagePath !== target.storagePath),
      );
      setRemovingRow(null);
    });
  }

  return (
    <div className="space-y-3">
      <input
        type="hidden"
        name="pending_attachments"
        value={JSON.stringify(
          rows
            .filter((r) => r.attachmentId === null)
            .map((r) => ({
              storagePath: r.storagePath,
              originalFilename: r.originalFilename,
              contentType: r.contentType,
              sizeBytes: r.sizeBytes,
              extractedText: r.extractedText,
            })),
        )}
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Attached references</p>
          <p className="text-sm text-muted-foreground">
            Up to {MAX_ATTACHMENTS} files (PDF, DOCX, TXT, MD, XLSX), 20MB each.
            Their text is sent to the model on every turn so the agent can use
            playbooks or standards as context.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || atCapacity}
        >
          <PaperclipIcon /> {uploading ? "Uploading…" : "Upload file"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_MIME}
          onChange={onPickFiles}
          className="hidden"
        />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No files attached.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.storagePath}
              className="flex items-start justify-between gap-3 rounded-md border border-border bg-card p-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{row.originalFilename}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(row.sizeBytes)}
                </p>
                {row.extractionWarning ? (
                  <p className="mt-1 flex items-start gap-1.5 text-xs text-destructive">
                    <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      Couldn&apos;t extract text from this file. The file is
                      uploaded but won&apos;t be used by the agent. Remove it
                      and try a different file.
                    </span>
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => confirmRemove(row)}
                aria-label={`Remove ${row.originalFilename}`}
                disabled={removePending}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={removingRow !== null}
        onOpenChange={(open) => {
          if (!open) setRemovingRow(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this file?</DialogTitle>
            <DialogDescription>
              <strong>{removingRow?.originalFilename}</strong> will be removed
              from this agent. The file is permanently deleted — there is no
              undo for attachments.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setRemovingRow(null)}
              disabled={removePending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={removePending}
            >
              {removePending ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
