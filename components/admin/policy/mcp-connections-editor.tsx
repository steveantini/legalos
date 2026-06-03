"use client";

import { ChevronDownIcon } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
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
import { Input } from "@/components/ui/input";
import { disconnectMcpServer } from "@/lib/actions/mcp-connection";
import type { OrgMcpConnection } from "@/lib/connections/mcp/connection-state";
import type { FirstPartyProviderGroup } from "@/lib/connections/providers/mcp-registry";
import { cn } from "@/lib/utils";

/**
 * The MCP connections control (admin Policy & access, flag 2c) — the super-admin
 * surface to connect trusted MCP servers and see them connected, parallel to the
 * Model connection control. Read-only for other admins.
 *
 * The trusted-only posture is visible by construction: the only ways to connect
 * are the vetted first-party servers (from the code allowlist) and a self-hosted
 * server the org runs. There is deliberately NO "add an arbitrary server" field —
 * the absence is the guarantee. Each connection's trust tier is DERIVED on read
 * (getOrgMcpConnections, 2b-iii), shown as a plain label, never inferred from a
 * stored value. First-party servers whose real endpoints aren't configured yet
 * are shown honestly as "available once configured" rather than implying a
 * connection the backend can't complete.
 *
 * Connecting is a redirect OAuth flow (like the data-source connectors); the
 * routes return to this page with ?mcp_connected / ?mcp_error, surfaced as a
 * toast. The data is server-rendered (the page awaits it), so there is no
 * client-side fetch to choreograph.
 */

const FIRST_PARTY_DESCRIPTIONS: Record<string, string> = {
  "google-drive-mcp": "Documents and files in Google Drive.",
  "google-gmail-mcp": "Email in Gmail.",
  "google-calendar-mcp": "Schedules in Google Calendar.",
};

function trustLabel(tier: OrgMcpConnection["trustTier"]): string {
  if (tier === "first_party") return "First-party official";
  if (tier === "self_hosted") return "Self-hosted";
  return "Unverified";
}

/** A connected server's one-line state: connected, plus its tool count (or an
 * honest note when the catalog hasn't been discovered yet). */
function connectedLine(connection: OrgMcpConnection): string {
  if (connection.tools === null) return "Connected · tools not yet discovered";
  const n = connection.tools.length;
  return `Connected · ${n} ${n === 1 ? "tool" : "tools"}`;
}

/**
 * The collapsed provider row's status summary — honest about the org's state with
 * the provider's servers: the catalog size plus how many are connected, or (while
 * endpoints are placeholders) that they're available once configured.
 */
function providerSummary(
  group: FirstPartyProviderGroup,
  connectedIds: Set<string>,
): string {
  const total = group.servers.length;
  const noun = total === 1 ? "server" : "servers";
  const connected = group.servers.filter((s) =>
    connectedIds.has(s.serverId),
  ).length;
  if (connected > 0) {
    return connected === total
      ? `${total} ${noun} · all connected`
      : `${total} ${noun} · ${connected} connected`;
  }
  const anyConfigured = group.servers.some((s) => s.configured);
  return anyConfigured
    ? `${total} ${noun} · ready to connect`
    : `${total} ${noun} · available once configured`;
}

/** Map a connect-flow error code to a friendly, non-revealing message. */
function connectErrorMessage(code: string): string {
  switch (code) {
    case "denied":
      return "The connection was cancelled.";
    case "not_allowed":
      return "Only super admins can connect a server.";
    case "unsupported_server":
      return "That server can’t be connected.";
    case "invalid_server_url":
      return "Enter a valid https server URL.";
    case "mcp_client_not_configured":
      return "This server needs a configured OAuth client that isn’t set up yet.";
    default:
      return "Could not complete the connection. Try again.";
  }
}

export function McpConnectionsEditor({
  connections: initialConnections,
  firstPartyGroups,
  canEdit,
  flash,
}: {
  connections: OrgMcpConnection[];
  firstPartyGroups: FirstPartyProviderGroup[];
  canEdit: boolean;
  flash?: { connected?: string; error?: string };
}) {
  const [connections, setConnections] =
    useState<OrgMcpConnection[]>(initialConnections);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [selfHostedUrl, setSelfHostedUrl] = useState("");
  const [selfHostedError, setSelfHostedError] = useState<string | null>(null);
  // Tool-list expand state (per connected server).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Provider-group expand state. Smart default: a provider with any connected
  // server opens (so the user sees their live connections immediately); otherwise
  // a sole provider opens (it looks complete and there's nothing to hide) while
  // several start collapsed for a scannable provider-level overview. Transient
  // (no persistence).
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(() => {
    const connected = new Set(initialConnections.map((c) => c.serverId));
    const open = new Set<string>();
    for (const group of firstPartyGroups) {
      const hasConnected = group.servers.some((s) => connected.has(s.serverId));
      if (hasConnected || firstPartyGroups.length === 1) open.add(group.provider);
    }
    return open;
  });
  const [pending, startTransition] = useTransition();

  // One-time toast on return from the redirect flow.
  useEffect(() => {
    if (flash?.connected) toast.success("Server connected.");
    else if (flash?.error) toast.error(connectErrorMessage(flash.error));
    // Mount-only: the flash reflects the just-completed redirect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectedIds = new Set(connections.map((c) => c.serverId));
  // Merge: each first-party server row looks up its own connection by serverId, so
  // connection state is shown inside the provider group rather than hoisted out.
  const connectionsById = new Map(connections.map((c) => [c.serverId, c]));
  // Self-hosted connections (the org's own servers, trust DERIVED on read) live in
  // their own distinct block, not in any first-party provider group.
  const selfHostedConnections = connections.filter(
    (c) => c.trustTier === "self_hosted",
  );

  function toggleProvider(provider: string) {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  }

  function connectFirstParty(serverId: string) {
    // Full-document navigation to the connect route (it sets the flow cookie and
    // redirects to consent); .assign keeps it a method call, not a global mutation.
    window.location.assign(
      `/api/connections/mcp/connect?server=${encodeURIComponent(serverId)}`,
    );
  }

  function connectSelfHosted() {
    const url = selfHostedUrl.trim();
    let valid = false;
    try {
      valid = new URL(url).protocol === "https:";
    } catch {
      valid = false;
    }
    if (!valid) {
      setSelfHostedError("Enter a valid https server URL.");
      return;
    }
    window.location.assign(
      `/api/connections/mcp/self-hosted?url=${encodeURIComponent(url)}`,
    );
  }

  function handleDisconnect(serverId: string) {
    if (pending) return;
    startTransition(async () => {
      const result = await disconnectMcpServer(serverId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setConnections((prev) => prev.filter((c) => c.serverId !== serverId));
      setRemoveTarget(null);
      toast.success("Server disconnected.");
    });
  }

  function toggleExpanded(serverId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(serverId)) next.delete(serverId);
      else next.add(serverId);
      return next;
    });
  }

  return (
    <section aria-labelledby="policy-mcp-connections" className="mt-12">
      <h2
        id="policy-mcp-connections"
        className="text-[17px] font-medium tracking-[-0.005em] text-foreground"
      >
        MCP connections
      </h2>
      <p className="mt-1.5 max-w-[70ch] text-[13px] leading-[1.5] text-muted-foreground">
        Connect trusted MCP servers, the open standard for giving your agents
        tools and live data. Only first-party official servers legalOS has vetted,
        or a server your organization hosts itself, can connect, never an
        arbitrary third-party server.
      </p>

      {/* One unified, provider-grouped list. Every first-party server lives inside
          its provider's expand/collapse group with its own connection state shown
          per row, so there is no separate hoisted "connected servers" section and
          the page stays organized as more providers connect. The collapsed row is
          the provider-level overview (label, descriptor, status summary). */}
      <div className="mt-5 space-y-2">
        {firstPartyGroups.map((group) => {
          const isOpen = expandedProviders.has(group.provider);
          return (
            <div
              key={group.provider}
              className="overflow-hidden rounded-lg border border-hairline bg-paper-2"
            >
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggleProvider(group.provider)}
                className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors duration-hover ease-soft hover:bg-secondary motion-reduce:transition-none"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-medium text-foreground">
                      {group.providerLabel}
                    </span>
                    <span className="rounded-full border border-hairline-strong bg-background px-2 py-0.5 text-[11px] font-medium text-foreground">
                      First-party official
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12.5px] leading-[1.5] text-caption">
                    {group.providerDescriptor}
                  </p>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <span className="text-[12px] text-muted-foreground">
                    {providerSummary(group, connectedIds)}
                  </span>
                  <ChevronDownIcon
                    aria-hidden="true"
                    className={cn(
                      "size-4 text-muted-foreground transition-transform duration-hover ease-soft motion-reduce:transition-none",
                      isOpen ? "rotate-180" : "",
                    )}
                  />
                </div>
              </button>

              {isOpen ? (
                <div className="border-t border-hairline">
                  {group.servers.map((server) => {
                    // Merge the registry server with its connection (if any),
                    // matched by serverId, so each row shows its own state.
                    const connection = connectionsById.get(server.serverId);
                    const isExpanded = expanded.has(server.serverId);
                    return (
                      <div
                        key={server.serverId}
                        className="flex items-start justify-between gap-4 border-t border-hairline px-4 py-3 first:border-t-0"
                      >
                        <div className="min-w-0">
                          <span className="text-[13.5px] font-medium text-foreground">
                            {server.displayName}
                          </span>
                          <p className="mt-0.5 text-[12.5px] leading-[1.5] text-caption">
                            {FIRST_PARTY_DESCRIPTIONS[server.serverId] ??
                              "A first-party server."}
                          </p>
                          {connection ? (
                            <div className="mt-2 flex items-center gap-2">
                              <span
                                aria-hidden="true"
                                className="size-1.5 shrink-0 rounded-full bg-foreground"
                              />
                              <p className="text-[13px] leading-[1.5] text-foreground">
                                {connectedLine(connection)}
                              </p>
                            </div>
                          ) : null}
                          {connection &&
                          connection.tools &&
                          connection.tools.length > 0 ? (
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={() => toggleExpanded(server.serverId)}
                                className="text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
                              >
                                {isExpanded ? "Hide tools" : "Show tools"}
                              </button>
                              {isExpanded ? (
                                <ul className="mt-2 flex flex-wrap gap-1.5 duration-200 animate-in fade-in-0 motion-reduce:animate-none">
                                  {connection.tools.map((tool) => (
                                    <li
                                      key={tool.name}
                                      className="rounded-md border border-hairline bg-background px-2 py-0.5 font-mono text-[11.5px] text-foreground"
                                    >
                                      {tool.name}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                        <div className="shrink-0">
                          {connection ? (
                            canEdit ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setRemoveTarget(server.serverId)}
                                disabled={pending}
                              >
                                Disconnect
                              </Button>
                            ) : null
                          ) : server.configured ? (
                            canEdit ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => connectFirstParty(server.serverId)}
                              >
                                Connect
                              </Button>
                            ) : null
                          ) : (
                            <span className="text-[12px] text-caption">
                              Available once configured
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Your own server — a self-hosted MCP server the org runs, on its own
          distinct path. Connected self-hosted servers show their state here (not
          in any first-party group); the connect form is super admins only. */}
      {canEdit || selfHostedConnections.length > 0 ? (
        <div className="mt-8">
          <h3 className="text-[14px] font-medium tracking-[-0.005em] text-foreground">
            Your own server
          </h3>

          {selfHostedConnections.length > 0 ? (
            <div className="mt-3 space-y-3">
              {selfHostedConnections.map((connection) => {
                const isExpanded = expanded.has(connection.serverId);
                return (
                  <div
                    key={connection.serverId}
                    className="rounded-xl border border-hairline-strong bg-paper-2 p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h4 className="text-[14.5px] font-medium tracking-[-0.005em] text-foreground">
                          {connection.label ?? connection.serverId}
                        </h4>
                        {connection.serverUrl ? (
                          <p className="mt-1 break-all text-[12.5px] leading-[1.5] text-muted-foreground">
                            {connection.serverUrl}
                          </p>
                        ) : null}
                      </div>
                      <TrustPill tier={connection.trustTier} />
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 rounded-full bg-foreground"
                      />
                      <p className="text-[13px] leading-[1.5] text-foreground">
                        {connectedLine(connection)}
                      </p>
                    </div>

                    {connection.tools && connection.tools.length > 0 ? (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(connection.serverId)}
                          className="text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
                        >
                          {isExpanded ? "Hide tools" : "Show tools"}
                        </button>
                        {isExpanded ? (
                          <ul className="mt-2 flex flex-wrap gap-1.5 duration-200 animate-in fade-in-0 motion-reduce:animate-none">
                            {connection.tools.map((tool) => (
                              <li
                                key={tool.name}
                                className="rounded-md border border-hairline bg-background px-2 py-0.5 font-mono text-[11.5px] text-foreground"
                              >
                                {tool.name}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}

                    {canEdit ? (
                      <div className="mt-4">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setRemoveTarget(connection.serverId)}
                          disabled={pending}
                        >
                          Disconnect
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {canEdit ? (
            <>
              <p className="mt-3 text-[12.5px] leading-[1.5] text-caption">
                Enter the URL of an MCP server your organization runs.
              </p>
              <div className="mt-3 rounded-lg border border-hairline bg-background p-4">
                <label
                  htmlFor="mcp-self-hosted-url"
                  className="text-[13px] font-medium text-foreground"
                >
                  MCP server URL
                </label>
                <Input
                  id="mcp-self-hosted-url"
                  type="url"
                  inputMode="url"
                  value={selfHostedUrl}
                  onChange={(event) => {
                    setSelfHostedUrl(event.target.value);
                    if (selfHostedError) setSelfHostedError(null);
                  }}
                  placeholder="https://mcp.yourfirm.com"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={selfHostedError ? true : undefined}
                  aria-describedby={
                    selfHostedError ? "mcp-self-hosted-error" : undefined
                  }
                  className="mt-2 max-w-[420px] bg-paper-2 font-mono text-[13px]"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      connectSelfHosted();
                    }
                  }}
                />
                {selfHostedError ? (
                  <p
                    id="mcp-self-hosted-error"
                    role="alert"
                    className="mt-2 text-[12.5px] leading-[1.5] text-destructive"
                  >
                    {selfHostedError}
                  </p>
                ) : (
                  <p className="mt-2 text-[12.5px] leading-[1.5] text-caption">
                    Must be an https URL. Your server authenticates with OAuth
                    2.1; legalOS keeps the credentials in its own encrypted vault.
                  </p>
                )}
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={connectSelfHosted}
                    disabled={selfHostedUrl.trim().length === 0}
                  >
                    Connect
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {!canEdit ? (
        <p className="mt-6 text-[13px] leading-[1.5] text-caption">
          Only super admins can connect or disconnect MCP servers. You’re viewing
          connection state as read only.
        </p>
      ) : null}

      <Dialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect this server?</DialogTitle>
            <DialogDescription>
              The connection and its stored credentials are removed. You can
              connect it again later. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRemoveTarget(null)}
              disabled={pending}
            >
              Keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => removeTarget && handleDisconnect(removeTarget)}
              disabled={pending}
            >
              {pending ? "Disconnecting…" : "Disconnect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** The derived trust-tier pill in a connected server's header. */
function TrustPill({ tier }: { tier: OrgMcpConnection["trustTier"] }) {
  if (tier === "first_party") {
    return (
      <span className="shrink-0 rounded-full border border-hairline-strong bg-background px-2.5 py-1 text-[12px] font-medium text-foreground">
        {trustLabel(tier)}
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full border border-hairline bg-background px-2.5 py-1 text-[12px] font-medium text-muted-foreground">
      {trustLabel(tier)}
    </span>
  );
}
