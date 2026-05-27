"use client";

import { AlertCircleIcon, FileTextIcon, Loader2Icon, XIcon } from "lucide-react";

import type { PendingAttachment } from "@/lib/chat/pending-attachment";

type AttachmentChipProps = {
  attachment: PendingAttachment;
  onRemove: () => void;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * One pending-attachment chip inside the composer. Three states:
 *   - attaching: spinner + "Attaching…", no remove X (can't cancel mid-flight)
 *   - ready:     file glyph + size, remove X
 *   - failed:    alert glyph + error subtitle, remove X (durable error state)
 */
export function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
  const isAttaching = attachment.status === "attaching";
  const isFailed = attachment.status === "failed";

  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-hairline bg-card px-2.5 py-1.5 text-sm">
      <div className="flex size-4 shrink-0 items-center justify-center text-caption">
        {isAttaching ? (
          <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : isFailed ? (
          <AlertCircleIcon className="size-4 text-destructive" aria-hidden />
        ) : (
          <FileTextIcon className="size-4" aria-hidden />
        )}
      </div>
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="max-w-[20ch] truncate text-foreground">
          {attachment.filename}
        </span>
        <span className="text-xs text-caption">
          {isAttaching
            ? "Attaching…"
            : isFailed
              ? errorMessageForCode(attachment.errorCode)
              : formatBytes(attachment.sizeBytes)}
        </span>
      </div>
      {!isAttaching ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${attachment.filename}`}
          className="ml-1 rounded-md p-0.5 text-caption transition-colors duration-release ease-release motion-reduce:transition-none hover:text-foreground hover:duration-hover hover:ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <XIcon className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

function errorMessageForCode(code: string): string {
  switch (code) {
    case "file_too_large":
      return "Over 20 MB";
    case "file_empty":
      return "Empty file";
    case "unsupported_type":
      return "Unsupported type";
    case "attachment_limit_reached":
      return "Up to 5 files";
    default:
      return "Couldn't attach";
  }
}
