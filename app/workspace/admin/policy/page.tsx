import type { Metadata } from "next";

import {
  ContentProvidersEditor,
  type ContentProviderRow,
} from "@/components/admin/policy/content-providers-editor";
import { DefaultModelEditor } from "@/components/admin/policy/default-model-editor";
import { McpConnectionsEditor } from "@/components/admin/policy/mcp-connections-editor";
import { ModelConnectionEditor } from "@/components/admin/policy/model-connection-editor";
import { PolicyEditor } from "@/components/admin/policy/policy-editor";
import { ResearchCapEditor } from "@/components/admin/policy/research-cap-editor";
import { CollectionsView } from "@/components/knowledge/collections-view";
import { HelpLink } from "@/components/workspace/help-link";
import type { HelpTopic } from "@/lib/workspace/help-links";
import { cn } from "@/lib/utils";
import {
  getEligibleSourceConnections,
  getManageableCollections,
  getOrgDepartmentsForPicker,
} from "@/lib/knowledge/collections-data";
import { getResearchDocumentCap } from "@/lib/knowledge/research/engine";
import {
  getCurrentUserProfile,
  getOrganizationDefaultModel,
  isCurrentUserSuperAdmin,
} from "@/lib/auth/access";
import {
  getVendorContentSettings,
  vendorContentEnabledFromSettings,
} from "@/lib/content/content-settings";
import { VENDOR_CONTENT_PROVIDERS } from "@/lib/content/vendor-registry";
import { getOrgMcpConnections } from "@/lib/connections/mcp/connection-state";
import { MCP_CATEGORY_ID } from "@/lib/connections/policy-derivation";
import { getOrgModelConnectionState } from "@/lib/connections/model-connection-state";
import { listFirstPartyServersByProvider } from "@/lib/connections/providers/mcp-registry";
import { CAPABILITY_GROUPS } from "@/lib/settings/connections-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Admin-facing one-line descriptions per vendor content provider. */
const CONTENT_PROVIDER_DESCRIPTIONS: Record<string, string> = {
  "claude-for-legal":
    "Prebuilt legal agents from Anthropic's open-source Claude for Legal suite, shown in each department.",
};

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

  // The viewing admin's org (0066): the model/MCP connection-state reads are
  // service-role (they bypass RLS), so they must be scoped to this org explicitly.
  const profile = await getCurrentUserProfile();
  const organizationId = profile?.organization_id ?? "";

  // The org default model, the model-connection state, and the MCP connections
  // all live independent of the connection policy, so they load and render even
  // if the policy read fails. The MCP read is service-side (the page awaits it),
  // so the connections are present on first paint — no client fetch to sequence.
  const orgDefaultModel = await getOrganizationDefaultModel();
  const researchDocumentCap = await getResearchDocumentCap();

  // Knowledge & access → curated folder collections (relocated here in Phase B).
  // The curated-only read (is_auto_folder = false) excludes the invisible
  // folder-picking backings; departments + eligible connections are loaded only
  // for the editing posture, mirroring the retired Collections page.
  const manageableCollections = await getManageableCollections();
  const collectionDepartments = canEdit ? await getOrgDepartmentsForPicker() : [];
  const eligibleSourceConnections = canEdit
    ? await getEligibleSourceConnections()
    : [];
  const anthropicModelConnection = await getOrgModelConnectionState(
    "anthropic",
    organizationId,
  );
  const mcpConnections = await getOrgMcpConnections(organizationId);
  const firstPartyMcpGroups = listFirstPartyServersByProvider();

  // Vendor content governance (Step 5): one row per registered provider, with its
  // org enablement (default permitted) and the last-refreshed timestamp the
  // platform-owner refresh writes (passive transparency, no action).
  const vendorSettings = await getVendorContentSettings();
  const contentProviders: ContentProviderRow[] = Object.values(
    VENDOR_CONTENT_PROVIDERS,
  ).map((provider) => ({
    providerId: provider.providerId,
    displayLabel: provider.displayLabel,
    description:
      CONTENT_PROVIDER_DESCRIPTIONS[provider.providerId] ??
      "Curated agents shown in each department.",
    enabled: vendorContentEnabledFromSettings(vendorSettings, provider.providerId),
    lastRefreshedAt: vendorSettings[provider.providerId]?.lastRefreshedAt ?? null,
  }));

  // The MCP connect flow returns here with a status query param; surface it once.
  const params = await searchParams;
  const mcpConnected =
    typeof params.mcp_connected === "string" ? params.mcp_connected : undefined;
  const mcpError =
    typeof params.mcp_error === "string" ? params.mcp_error : undefined;

  // RLS scopes this to the caller's own org policy row (0066), so no filter is
  // needed. A read ERROR shows the calm error state; a genuinely ABSENT row (a
  // new org with no policy yet) falls back to the seeded permissive default so the
  // editor opens in the out-of-box state rather than reading as a failure.
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("connection_policy")
    .select("allowed_categories, default_capability_ceiling")
    .maybeSingle();

  const loadFailed = Boolean(error);
  const policyRow = (data as {
    allowed_categories: string[] | null;
    default_capability_ceiling: string[] | null;
  } | null) ?? {
    allowed_categories: [
      "file-storage",
      "calendar",
      "mail",
      "messaging",
      "matter-management",
    ],
    default_capability_ceiling: ["read"],
  };

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
      <header className="min-w-0">
        <h1 className="text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          Policy & access
        </h1>
        <p className="mt-[14px] max-w-[60ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          The organization&rsquo;s governance, in three areas: the models your
          agents run on, what they can reach, and the controls around Knowledge.
          Each area has its own guide.
        </p>
      </header>

      {/* Models: whose key / which provider, then which model new agents start on. */}
      <PolicySubsectionHeader
        id="models"
        title="Models"
        description="The engine your agents run on."
        topic="models"
        first
      />
      <ModelConnectionEditor
        anthropicState={anthropicModelConnection}
        canEdit={canEdit}
      />
      <DefaultModelEditor currentModelId={orgDefaultModel} canEdit={canEdit} />

      {/* Connections: the standing guardrail, the connected servers, the libraries. */}
      <PolicySubsectionHeader
        id="connections"
        title="Connections"
        description="What your agents can reach, and the content libraries you show."
        topic="connections"
      />
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
            (policyRow.default_capability_ceiling ?? []) as string[]
          ).includes("write")}
          initialAllowedCategories={
            (policyRow.allowed_categories ?? []) as string[]
          }
          canEdit={canEdit}
        />
      )}

      <McpConnectionsEditor
        connections={mcpConnections}
        firstPartyGroups={firstPartyMcpGroups}
        canEdit={canEdit}
        // The honest cross-reference to the Allowed-connections control above:
        // when the MCP category is denied, connected servers' tools are
        // unavailable to agents (D-104). Undefined when the policy read failed.
        mcpCategoryAllowed={
          loadFailed
            ? undefined
            : ((policyRow.allowed_categories ?? []) as string[]).includes(
                MCP_CATEGORY_ID,
              )
        }
        flash={
          mcpConnected || mcpError
            ? { connected: mcpConnected, error: mcpError }
            : undefined
        }
      />

      {/* Content: the org-level half of vendor-content governance — which curated
          libraries the org shows, and when they were last updated. */}
      <ContentProvidersEditor providers={contentProviders} canEdit={canEdit} />

      {/* Knowledge & access: the research cap today; folder governance and member
          self-service land in this subsection in Phases B and C. */}
      <PolicySubsectionHeader
        id="knowledge-access"
        title="Knowledge & access"
        description="The governance around Knowledge."
        topic="knowledge-access"
      />
      <ResearchCapEditor initialCap={researchDocumentCap} canEdit={canEdit} />

      {/* Curated folder collections, relocated from the retired Collections route
          (Phase B). A quiet sub-heading keeps it distinct from the research cap
          under the one Knowledge & access help drawer; the manager and its
          actions are unchanged. */}
      <section aria-labelledby="policy-folder-collections" className="mt-12">
        <h2
          id="policy-folder-collections"
          className="text-[17px] font-medium tracking-[-0.005em] text-foreground"
        >
          Folder collections
        </h2>
        <p className="mt-1.5 max-w-[70ch] text-[13px] leading-[1.5] text-muted-foreground">
          The named collections an administrator curates over connected drives.
          Folders picked directly in Research and Structured Query are managed
          there; these curated collections are the way to scope a set of folders
          to specific departments.
        </p>
        <div className="mt-5">
          <CollectionsView
            collections={manageableCollections}
            departments={collectionDepartments}
            eligibleConnections={eligibleSourceConnections}
            canEdit={canEdit}
          />
        </div>
      </section>
    </>
  );
}

/**
 * A quiet subsection header for the Policy & access page: an uppercase zone
 * label (the Knowledge-pages luxury-hierarchy idiom) with the subsection's own
 * help drawer on the right, and a hairline break between zones. Presentation
 * only; it groups the existing editors without changing any of them.
 */
function PolicySubsectionHeader({
  id,
  title,
  description,
  topic,
  first = false,
}: {
  id: string;
  title: string;
  description: string;
  topic: HelpTopic;
  first?: boolean;
}) {
  return (
    <div
      id={id}
      className={cn(
        "flex items-end justify-between gap-4 scroll-mt-6",
        first ? "mt-14" : "mt-20 border-t border-hairline pt-12",
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </h2>
        <p className="mt-1.5 max-w-[60ch] text-[13px] leading-[1.5] text-caption">
          {description}
        </p>
      </div>
      <HelpLink topic={topic} />
    </div>
  );
}
