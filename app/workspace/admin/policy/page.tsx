import type { Metadata } from "next";

import { DefaultModelEditor } from "@/components/admin/policy/default-model-editor";
import { McpConnectionsEditor } from "@/components/admin/policy/mcp-connections-editor";
import { ModelConnectionEditor } from "@/components/admin/policy/model-connection-editor";
import { PolicyEditor } from "@/components/admin/policy/policy-editor";
import {
  getOrganizationDefaultModel,
  isCurrentUserSuperAdmin,
} from "@/lib/auth/access";
import { getOrgMcpConnections } from "@/lib/connections/mcp/connection-state";
import { MCP_CATEGORY_ID } from "@/lib/connections/policy-derivation";
import { getOrgModelConnectionState } from "@/lib/connections/model-connection-state";
import { listFirstPartyServersByProvider } from "@/lib/connections/providers/mcp-registry";
import { CAPABILITY_GROUPS } from "@/lib/settings/connections-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Policy & access",
};

/**
 * Policy & access (GOVERN, A2) — the super-admin editor for the org's connection
 * policy, over the enforcement shipped in the connector arc (closes D-066).
 *
 * Read failure vs genuine state: this reads the `connection_policy` row DIRECTLY
 * (not via `getConnectionPolicy`, whose fail-closed sentinel returns all-empty
 * arrays on error — indistinguishable from a genuinely empty saved policy). A
 * read error or a missing row (`error || data === null`) renders a calm error
 * state; only a successfully returned row populates the editor. So the deny-all
 * sentinel is never shown as if the admin had saved an empty policy.
 *
 * Super-admins get the interactive editor; every other admin who can reach the
 * admin section sees the same policy read only (no controls, no save), gated by
 * `isCurrentUserSuperAdmin()` which mirrors the write RLS (D-041). The admin
 * layout already gates the section to admins and owns the 896px left-justified
 * `<main>`; this page renders a fragment inside it.
 */

// Admin-facing one-line descriptions per category, keyed by the registry id.
// Shorter and admin-framed (vs the user-facing copy in connections-data).
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "file-storage": "Documents your agents can reference when drafting.",
  calendar: "Schedules your agents can read for context.",
  mail: "Inbox context for agents, and drafts on your approval.",
  messaging: "Conversations agents can reference and post to.",
  "matter-management": "Matters and deals from your organization’s systems.",
};

export default async function AdminPolicyPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const canEdit = await isCurrentUserSuperAdmin();

  // The org default model, the model-connection state, and the MCP connections
  // all live independent of the connection policy, so they load and render even
  // if the policy read fails. The MCP read is service-side (the page awaits it),
  // so the connections are present on first paint — no client fetch to sequence.
  const orgDefaultModel = await getOrganizationDefaultModel();
  const anthropicModelConnection = await getOrgModelConnectionState("anthropic");
  const mcpConnections = await getOrgMcpConnections();
  const firstPartyMcpGroups = listFirstPartyServersByProvider();

  // The MCP connect flow returns here with a status query param; surface it once.
  const params = await searchParams;
  const mcpConnected =
    typeof params.mcp_connected === "string" ? params.mcp_connected : undefined;
  const mcpError =
    typeof params.mcp_error === "string" ? params.mcp_error : undefined;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("connection_policy")
    .select("allowed_categories, default_capability_ceiling")
    .eq("id", 1)
    .maybeSingle();

  const loadFailed = Boolean(error) || data === null;

  const categories = [
    ...CAPABILITY_GROUPS.map((group) => ({
      id: group.id,
      title: group.title,
      description: CATEGORY_DESCRIPTIONS[group.id] ?? group.description,
    })),
    // MCP is a GOVERNED category alongside the data-source kinds (Phase 2): the
    // org-wide switch for whether agents may use MCP-server tools. Connecting a
    // server (MCP connections, below) and permitting this category must BOTH hold.
    {
      id: MCP_CATEGORY_ID,
      title: "MCP servers",
      description:
        "Tools and live data your agents reach through connected MCP servers.",
    },
  ];

  return (
    <>
      <header>
        <h1 className="text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          Policy & access
        </h1>
        <p className="mt-[14px] max-w-[60ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          Set up the engine your agents run on, then what they can reach: the
          model and whose key powers it, then which connections and trusted
          servers it can use.
        </p>
      </header>

      {/* The engine: whose key / which provider, then which model new agents start on. */}
      <ModelConnectionEditor
        anthropicState={anthropicModelConnection}
        canEdit={canEdit}
      />

      <DefaultModelEditor currentModelId={orgDefaultModel} canEdit={canEdit} />

      {/* The reach: the standing connection guardrail, then the connected servers. */}
      {loadFailed ? (
        <p
          role="alert"
          className="mt-12 rounded-lg border border-hairline bg-paper-2 px-4 py-3 text-[13px] leading-[1.5] text-foreground"
        >
          We couldn’t load the current policy. Reload the page to try again.
        </p>
      ) : (
        <PolicyEditor
          categories={categories}
          initialAllowWrite={(
            (data.default_capability_ceiling ?? []) as string[]
          ).includes("write")}
          initialAllowedCategories={
            (data.allowed_categories ?? []) as string[]
          }
          canEdit={canEdit}
        />
      )}

      <McpConnectionsEditor
        connections={mcpConnections}
        firstPartyGroups={firstPartyMcpGroups}
        canEdit={canEdit}
        flash={
          mcpConnected || mcpError
            ? { connected: mcpConnected, error: mcpError }
            : undefined
        }
      />
    </>
  );
}
