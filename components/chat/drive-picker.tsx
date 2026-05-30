"use client";

import { CheckIcon, ChevronRightIcon, FolderIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { DriveFileIcon, driveTypeLabel } from "./drive-file-icon";
import { GoogleDriveGlyph } from "./google-drive-glyph";

import {
  getDriveFolderPathAction,
  listDriveFolderAction,
  listRecentDriveFilesAction,
  searchDriveFilesAction,
} from "@/lib/actions/drive-picker";
import type {
  DriveCrumb,
  DriveIconType,
  DriveItem,
  DriveListErrorReason,
} from "@/lib/connections/providers/google-drive-listing";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** A file the user picked, shaped for {@link PendingAttachment}'s Drive variant. */
export type DrivePickedFile = {
  fileId: string;
  name: string;
  mimeType: string;
  iconType: DriveIconType;
};

const CONNECTIONS_PATH = "/workspace/settings/connections";
const SEARCH_DEBOUNCE_MS = 250;
const ROOT_FOLDER = "root";

type LoadStatus = "loading" | "ready" | "error";

/**
 * The base (non-search) view: recents or a specific folder. Held as a "request"
 * the load effect reacts to; the fetched result is tagged with the request it
 * answers, so the displayed loading state can be derived rather than set
 * synchronously inside an effect. Search results layer on top while the query is
 * non-empty; clearing the search returns to whichever base view was active.
 */
type BaseRequest = { kind: "recents" } | { kind: "folder"; folderId: string };

type BaseResult = {
  request: BaseRequest;
  status: "ready" | "error";
  items: DriveItem[];
  error: DriveListErrorReason | null;
  crumbs: DriveCrumb[];
};

function sameRequest(a: BaseRequest, b: BaseRequest): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "folder" && b.kind === "folder") {
    return a.folderId === b.folderId;
  }
  return true;
}

type DrivePickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** How many more attachments the composer can accept (the 5-per-message cap). */
  remainingSlots: number;
  /** Fires with the picked files when the user confirms. */
  onAttach: (files: DrivePickedFile[]) => void;
};

function relativeTime(iso: string): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs)) return "";
  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * The Google Drive attachment picker (M6c2). A focused modal over the M6c1
 * listing layer: opens to recents, searches globally by name (debounced), and
 * browses folders via a clickable breadcrumb, all on one list surface.
 * Unsupported file types render dimmed and unselectable (honest-at-selection),
 * and a not-connected result invites connection rather than erroring. Confirmed
 * files attach as live Drive attachments through the existing send path.
 */
export function DrivePicker({
  open,
  onOpenChange,
  remainingSlots,
  onAttach,
}: DrivePickerProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<DriveItem[]>([]);

  // The base view the user is on. Navigation sets this from event handlers; the
  // load effect reacts to it.
  const [baseRequest, setBaseRequest] = useState<BaseRequest>({
    kind: "recents",
  });
  const [baseResult, setBaseResult] = useState<BaseResult | null>(null);

  // Search results, tagged with the query they answer, so the loading state can
  // be derived (results not yet in for the current query) instead of set
  // synchronously — which also removes the "No files found" flash mid-debounce.
  const [searchResult, setSearchResult] = useState<{
    query: string;
    status: "ready" | "error";
    items: DriveItem[];
    error: DriveListErrorReason | null;
  }>({ query: "", status: "ready", items: [], error: null });

  // Monotonic tokens so a slow response from an abandoned view (an old folder,
  // a stale search keystroke) can't overwrite the current one.
  const baseReqRef = useRef(0);
  const searchReqRef = useRef(0);

  const trimmedQuery = query.trim();
  const searching = trimmedQuery.length > 0;

  // Fetch a base view. The first statement after a ref bump is an await, so no
  // setState runs synchronously when this is called from the load effect — the
  // result lands only once the request resolves. Folder browsing fetches the
  // contents and the breadcrumb path together.
  const fetchBase = useCallback(async (request: BaseRequest) => {
    const token = ++baseReqRef.current;
    if (request.kind === "recents") {
      const result = await listRecentDriveFilesAction();
      if (token !== baseReqRef.current) return;
      setBaseResult(
        result.ok
          ? { request, status: "ready", items: result.data, error: null, crumbs: [] }
          : { request, status: "error", items: [], error: result.reason, crumbs: [] },
      );
      return;
    }
    const [contents, path] = await Promise.all([
      listDriveFolderAction(request.folderId),
      getDriveFolderPathAction(request.folderId),
    ]);
    if (token !== baseReqRef.current) return;
    setBaseResult(
      contents.ok
        ? {
            request,
            status: "ready",
            items: contents.data,
            error: null,
            crumbs: path.ok ? path.data : [],
          }
        : { request, status: "error", items: [], error: contents.reason, crumbs: [] },
    );
  }, []);

  // Run a global search for the (trimmed, non-empty) query. Awaits before any
  // setState; a stale response is dropped via the request token.
  const runSearch = useCallback(async (q: string) => {
    const token = ++searchReqRef.current;
    const result = await searchDriveFilesAction(q);
    if (token !== searchReqRef.current) return;
    setSearchResult(
      result.ok
        ? { query: q, status: "ready", items: result.data, error: null }
        : { query: q, status: "error", items: [], error: result.reason },
    );
  }, []);

  // Load the base view when the picker opens and whenever the requested view
  // changes (folder navigation). fetchBase awaits before any setState, so this
  // effect triggers no synchronous state update. Selection and query reset on
  // close (an event-handler path), so opening always starts on a clean recents.
  useEffect(() => {
    if (open) void fetchBase(baseRequest);
  }, [open, baseRequest, fetchBase]);

  // Debounced global search. Skips a query whose results we already hold; an
  // empty query shows the base view (stale search values go unused until the
  // same query is typed again, which then renders instantly). The scheduled
  // runSearch awaits before setState, so nothing is set synchronously here.
  useEffect(() => {
    if (trimmedQuery.length === 0) return;
    if (searchResult.query === trimmedQuery) return;
    const handle = setTimeout(
      () => void runSearch(trimmedQuery),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(handle);
  }, [trimmedQuery, searchResult.query, runSearch]);

  // A result is "settled" only when it answers the current request/query; until
  // then the picker shows loading rather than a stale or empty list.
  const baseSettled =
    baseResult !== null && sameRequest(baseResult.request, baseRequest);
  const searchSettled = searching && searchResult.query === trimmedQuery;

  const items = searching
    ? searchSettled
      ? searchResult.items
      : []
    : baseSettled
      ? baseResult.items
      : [];
  const status: LoadStatus = searching
    ? searchSettled
      ? searchResult.status
      : "loading"
    : baseSettled
      ? baseResult.status
      : "loading";
  const error = searching
    ? searchSettled
      ? searchResult.error
      : null
    : baseSettled
      ? baseResult.error
      : null;
  const crumbs =
    baseSettled && baseRequest.kind === "folder" ? baseResult.crumbs : [];

  const atCap = selected.length >= remainingSlots;
  const showBreadcrumb = !searching && baseRequest.kind === "folder";

  // Identity of the currently-shown view. Keying the list wrapper on this eases
  // the content in on each meaningful change (open, folder navigation, search
  // results arriving, returning home) instead of snapping. It stays stable
  // across keystrokes while a search is still loading, so the skeleton doesn't
  // re-animate on every character.
  const viewKey = searching
    ? `search:${searchSettled ? trimmedQuery : "loading"}`
    : `${baseRequest.kind}:${
        baseRequest.kind === "folder" ? baseRequest.folderId : ""
      }:${baseSettled ? "ready" : "loading"}`;

  // Navigate into a folder (event-handler path): record the request and leave
  // search; the load effect fetches it.
  function navigateToFolder(folderId: string) {
    setQuery("");
    setBaseRequest({ kind: "folder", folderId });
  }

  // Return to the default recents view from any browse depth (the leading
  // "Recents" breadcrumb crumb). Recents — recently-modified files across all
  // folders — is a distinct home base from the My Drive root folder listing.
  function backToRecents() {
    setQuery("");
    setBaseRequest({ kind: "recents" });
  }

  // Reset to a clean recents view on close (an event-handler path, not an
  // effect), so the next open starts fresh. The dialog's own dismiss affordances
  // and the Attach action both route through here.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setSelected([]);
      setQuery("");
      setBaseRequest({ kind: "recents" });
      setBaseResult(null);
    }
    onOpenChange(next);
  }

  function isSelected(item: DriveItem): boolean {
    return selected.some((s) => s.id === item.id);
  }

  function handleRowClick(item: DriveItem) {
    if (item.isFolder) {
      navigateToFolder(item.id);
      return;
    }
    if (!item.isSupported) return;
    setSelected((prev) => {
      if (prev.some((s) => s.id === item.id)) {
        return prev.filter((s) => s.id !== item.id);
      }
      if (prev.length >= remainingSlots) return prev;
      return [...prev, item];
    });
  }

  function handleAttach() {
    if (selected.length === 0) return;
    onAttach(
      selected.map((s) => ({
        fileId: s.id,
        name: s.name,
        mimeType: s.mimeType,
        iconType: s.iconType,
      })),
    );
    handleOpenChange(false);
  }

  function retry() {
    if (searching) {
      void runSearch(trimmedQuery);
    } else {
      void fetchBase(baseRequest);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[min(80vh,40rem)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="flex-row items-center gap-2 border-b border-hairline px-4 py-3">
          <GoogleDriveGlyph className="size-4 shrink-0 text-muted-foreground" />
          <DialogTitle>Attach from Google Drive</DialogTitle>
        </DialogHeader>

        {/* Search box — always present, autofocused on open. */}
        <div className="border-b border-hairline px-4 py-3">
          <div className="relative">
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your Drive"
              aria-label="Search your Drive"
              className="h-9 pl-8"
            />
          </div>

          {/* Breadcrumb (folder browsing) or a quiet path into root browsing. */}
          {showBreadcrumb ? (
            <Breadcrumb
              crumbs={crumbs}
              onNavigate={navigateToFolder}
              onHome={backToRecents}
            />
          ) : !searching ? (
            <button
              type="button"
              onClick={() => navigateToFolder(ROOT_FOLDER)}
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors duration-release ease-release motion-reduce:transition-none hover:text-foreground hover:duration-hover hover:ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <FolderIcon className="size-3.5" aria-hidden />
              Browse all files
            </button>
          ) : null}
        </div>

        {/* List surface. The inner wrapper is keyed by the current view, so its
            content eases in (a quick fade plus a slight settle) on open and on
            every view change rather than snapping. duration-press (150ms) is the
            project's in-range quick-timing token; ease-soft is its soft ease-out,
            the same pairing used for hover/settle elsewhere. Reduced motion off. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <div
            key={viewKey}
            className="animate-in fade-in slide-in-from-top-1 duration-press ease-soft motion-reduce:animate-none"
          >
            {error === "not_authorized" ? (
              <ConnectPrompt onNavigate={() => handleOpenChange(false)} />
            ) : status === "loading" ? (
              <SkeletonRows />
            ) : status === "error" ? (
              <ErrorState onRetry={retry} />
            ) : items.length === 0 ? (
              <EmptyState searching={searching} />
            ) : (
              <ul className="flex flex-col">
                {items.map((item) => (
                  <DriveRow
                    key={item.id}
                    item={item}
                    selected={isSelected(item)}
                    selectable={!item.isFolder && item.isSupported}
                    disabledByCap={
                      !item.isFolder &&
                      item.isSupported &&
                      atCap &&
                      !isSelected(item)
                    }
                    onClick={() => handleRowClick(item)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Footer: selection count + Attach. */}
        <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {selected.length === 0
              ? atCap && remainingSlots === 0
                ? "No room for more files"
                : "No files selected"
              : `${selected.length} file${selected.length === 1 ? "" : "s"} selected`}
            {selected.length > 0 && atCap ? " (max reached)" : ""}
          </span>
          <Button
            type="button"
            size="sm"
            onClick={handleAttach}
            disabled={selected.length === 0}
          >
            Attach
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Breadcrumb({
  crumbs,
  onNavigate,
  onHome,
}: {
  crumbs: DriveCrumb[];
  onNavigate: (folderId: string) => void;
  onHome: () => void;
}) {
  return (
    <nav
      aria-label="Folder path"
      className="mt-2 flex flex-wrap items-center gap-0.5 text-xs text-muted-foreground"
    >
      {/* Always-present home anchor: returns to the default recents view from
          any browse depth (kept visible even while a folder's path loads), which
          makes browsing a round-trip. Distinct from the My Drive root-folder
          crumb that follows it. */}
      <span className="inline-flex items-center gap-0.5">
        <button
          type="button"
          onClick={onHome}
          className="max-w-[14ch] truncate rounded px-1 py-0.5 transition-colors duration-release ease-release motion-reduce:transition-none hover:text-foreground hover:duration-hover hover:ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Recents
        </button>
        {crumbs.length > 0 ? (
          <ChevronRightIcon className="size-3 shrink-0" aria-hidden />
        ) : null}
      </span>
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.id} className="inline-flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => onNavigate(crumb.id)}
              disabled={isLast}
              className={cn(
                "max-w-[14ch] truncate rounded px-1 py-0.5 transition-colors duration-release ease-release motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                isLast
                  ? "font-medium text-foreground"
                  : "hover:text-foreground hover:duration-hover hover:ease-soft",
              )}
            >
              {crumb.name}
            </button>
            {!isLast ? (
              <ChevronRightIcon className="size-3 shrink-0" aria-hidden />
            ) : null}
          </span>
        );
      })}
    </nav>
  );
}

function DriveRow({
  item,
  selected,
  selectable,
  disabledByCap,
  onClick,
}: {
  item: DriveItem;
  selected: boolean;
  selectable: boolean;
  disabledByCap: boolean;
  onClick: () => void;
}) {
  const interactive = item.isFolder || (selectable && !disabledByCap);
  const dimmed = !item.isFolder && !item.isSupported;

  const secondary = item.isFolder
    ? null
    : !item.isSupported
      ? "Not a supported type"
      : `${driveTypeLabel(item.iconType)} · edited ${relativeTime(item.modifiedTime)}`;

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={!interactive}
        aria-pressed={selectable ? selected : undefined}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-release ease-release motion-reduce:transition-none",
          interactive &&
            "hover:bg-muted hover:duration-hover hover:ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          !interactive && "cursor-default",
          dimmed && "opacity-45",
          disabledByCap && "opacity-60",
          selected && "bg-muted",
        )}
      >
        <DriveFileIcon
          iconType={item.iconType}
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-sm text-foreground">{item.name}</span>
          {secondary ? (
            <span className="truncate text-xs text-muted-foreground">
              {secondary}
            </span>
          ) : null}
        </span>
        {item.isFolder ? (
          <ChevronRightIcon
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        ) : selected ? (
          <CheckIcon className="size-4 shrink-0 text-primary" aria-hidden />
        ) : null}
      </button>
    </li>
  );
}

function SkeletonRows() {
  return (
    <ul className="flex flex-col" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-2 py-2">
          <div className="size-4 shrink-0 rounded bg-muted" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-3 w-1/2 rounded bg-muted" />
            <div className="h-2.5 w-1/3 rounded bg-muted/70" />
          </div>
        </li>
      ))}
      <span className="sr-only" aria-hidden={false}>
        Loading your Drive files
      </span>
    </ul>
  );
}

function EmptyState({ searching }: { searching: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-12 text-center">
      <p className="text-sm text-foreground">
        {searching ? "No files found" : "This folder is empty"}
      </p>
      <p className="text-xs text-muted-foreground">
        {searching
          ? "Try a different search, or browse your folders."
          : "Nothing here yet."}
      </p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-foreground">Couldn’t reach Google Drive</p>
        <p className="text-xs text-muted-foreground">
          Try again, or check your connection in Settings.
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function ConnectPrompt({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <GoogleDriveGlyph className="size-7 text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <p className="text-sm text-foreground">
          Connect Google Drive to attach your files
        </p>
        <p className="text-xs text-muted-foreground">
          Your files stay in Drive and are read at their current version when an
          agent runs.
        </p>
      </div>
      <Button type="button" size="sm" render={<Link href={CONNECTIONS_PATH} />} onClick={onNavigate}>
        Connect in Settings
      </Button>
    </div>
  );
}
