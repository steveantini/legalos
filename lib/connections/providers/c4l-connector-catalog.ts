/**
 * The Claude for Legal connector catalog — the legal-system MCP connectors
 * harvested from the `.mcp.json` configs Anthropic ships with each Claude for
 * Legal plugin, translated into trusted-registry entries (the connector
 * catalog arc).
 *
 * WHY THIS EXISTS: when a customer says "we use Ironclad," enabling it should
 * be a toggle plus their credentials, not a research project. The catalog
 * front-loads the discovery work: each entry carries the vendor's official
 * MCP endpoint, its auth model, a category, the practice areas it ships in,
 * and provenance back to the exact upstream commit, all pre-vetted against
 * Anthropic's published connector criteria (CONNECTORS.md: remote HTTPS,
 * OAuth/API-key auth, read-heavy tools, provenance in results,
 * injection-resistance) — which align with this product's trusted-only bar.
 *
 * DISABLED BY DEFAULT, by construction: a catalog entry is registry
 * MEMBERSHIP only. Nothing here connects anything or changes any
 * organization. A server reaches an org only when that org's super admin
 * runs the governed connect flow with the org's own credentials, and agents
 * can use its tools only while the org's policy permits the MCP category.
 *
 * HONEST STATUS: `available` means pre-seeded from the upstream configs and
 * not yet live-verified by legalOS; `verified` means legalOS proved the full
 * path live (connect, tool discovery, a real agent read). Per-connector
 * vetting still happens at first live enablement; the status field is where
 * that result lands.
 *
 * Deliberately NOT harvested: Google Drive (the same endpoint is already a
 * first-party registry entry, `google-drive-mcp`, verified live) and
 * CoCounsel (`external_plugins/cocounsel-legal`, deferred per D-051; it
 * lands here when a customer brings a Thomson Reuters subscription).
 *
 * Pure data, importable from client and server alike (endpoints are public;
 * nothing here is a secret). The trusted-MCP registry
 * (`lib/connections/providers/mcp-registry.ts`) translates these into
 * first-party entries; tool mapping and the chat trace derive their clean
 * tool prefixes and display labels from the same rows, so adding a connector
 * is one entry here.
 */

/** Where the catalog was harvested from: the upstream repo and the exact
 * commit read at harvest time. Refresh sessions that re-harvest update the
 * commit in the same change, so future gap analyses never need git
 * archaeology to learn what was synced. */
export const C4L_CONNECTOR_SOURCE = {
  repo: "https://github.com/anthropics/claude-for-legal",
  commit: "248331e0fedd76418edd8b46ca895518f9a009ce",
} as const;

/**
 * Catalog verification status. `available` = pre-seeded from the vetted
 * upstream configs, not yet live-verified by legalOS. `verified` = legalOS
 * proved the full path live: connect, tool discovery, and a real agent read.
 */
export type ConnectorCatalogStatus = "available" | "verified";

/**
 * How a connector authenticates. Every remote server in the catalog speaks
 * MCP's OAuth 2.1 flow today (CourtListener's authorization server was
 * confirmed live: dynamic client registration, authorization code, PKCE).
 * `api-key` and `none` are representable for future entries whose vendors
 * use them; the connect flow gains those paths when the first such entry
 * arrives.
 */
export type ConnectorAuthModel = "oauth" | "api-key" | "none";

/** A catalog display category. Key order is display order everywhere. */
export type ConnectorCategoryInfo = {
  label: string;
  descriptor: string;
};

/**
 * The catalog's display taxonomy — how a legal buyer thinks about these
 * systems. DISTINCT from the governed connection-policy categories: MCP
 * connections are governed as the single `mcp` policy category (D-104);
 * these keys group the catalog for scanning, they are not policy levers.
 */
export const CONNECTOR_CATEGORIES = {
  "contract-lifecycle": {
    label: "Contract lifecycle",
    descriptor: "Contract repositories, agreement workflows, and signatures.",
  },
  "document-management": {
    label: "Document management",
    descriptor: "Governed document stores and data rooms.",
  },
  "e-discovery": {
    label: "E-discovery",
    descriptor: "Review platforms and cross-matter investigation.",
  },
  "court-data": {
    label: "Court data",
    descriptor: "Dockets, opinions, filings, and court analytics.",
  },
  "legal-research": {
    label: "Legal research",
    descriptor: "Case law, patents, and procedural guidance.",
  },
  "counsel-network": {
    label: "Outside counsel",
    descriptor: "Counsel recommendations and expertise evidence.",
  },
  "skills-library": {
    label: "Skill libraries",
    descriptor: "Curated legal AI skills from practitioners.",
  },
  productivity: {
    label: "Productivity",
    descriptor: "The everyday tools around the legal work.",
  },
} satisfies Record<string, ConnectorCategoryInfo>;

export type ConnectorCategoryKey = keyof typeof CONNECTOR_CATEGORIES;

/** One harvested connector, translated from its plugin `.mcp.json` entry. */
export type C4LConnector = {
  /** Registry server id, `<slug>-mcp` by the registry's id convention. */
  serverId: string;
  /** Display name, as the vendor writes it. */
  displayName: string;
  /**
   * The clean tool-namespace prefix (`<prefix>__<tool>`), consumed by
   * tool-mapping for namespacing and by the chat trace for labels. Must
   * satisfy Anthropic's tool-name charset and stay unique across the
   * registry (asserted by tests).
   */
  toolPrefix: string;
  /** The vendor's official MCP endpoint, VERBATIM from the upstream config. */
  endpoint: string;
  /** One-line description, in the product's register (no em dashes). */
  description: string;
  category: ConnectorCategoryKey;
  /** Every C4L plugin slug whose `.mcp.json` ships this connector (provenance). */
  plugins: string[];
  authModel: ConnectorAuthModel;
  status: ConnectorCatalogStatus;
  /**
   * The honest access note shown where an org admin decides to connect:
   * what the organization must already have for this connector to be
   * useful (a vendor account, a workspace), or that it is free.
   */
  accessNote: string;
  /**
   * Whether the server's tool surface can ENUMERATE a repository (list a
   * folder's contents with stable ids and pagination), which is what lets it
   * back a Knowledge collection source. Recorded per connector as a vetted
   * capability: Box documents `list_folder_content_by_folder_id`; search-only
   * or corpus-style servers (CourtListener is a public research corpus, not a
   * customer repository) are false. False until shown otherwise.
   */
  canEnumerate: boolean;
};

// Shared plugin lists for the connectors that ship suite-wide. Slack and
// Google Drive appear in all twelve plugin configs; Drive is deduped against
// the existing `google-drive-mcp` registry entry (same endpoint), so only
// Slack carries the full list here.
const ALL_TWELVE_PLUGINS = [
  "ai-governance-legal",
  "commercial-legal",
  "corporate-legal",
  "employment-legal",
  "ip-legal",
  "law-student",
  "legal-builder-hub",
  "legal-clinic",
  "litigation-legal",
  "privacy-legal",
  "product-legal",
  "regulatory-legal",
];

/**
 * The harvested catalog: every distinct connector across the 13 upstream
 * `.mcp.json` configs (12 plugins + external_plugins/cocounsel-legal),
 * deduped, minus Google Drive (already registered) and CoCounsel (deferred).
 * Ordered by category, then as a reader would scan within it.
 */
export const C4L_CONNECTORS: ReadonlyArray<C4LConnector> = [
  // Contract lifecycle -------------------------------------------------------
  {
    serverId: "ironclad-mcp",
    displayName: "Ironclad",
    toolPrefix: "ironclad",
    endpoint: "https://mcp.na1.ironcladapp.com/mcp",
    description:
      "Search your contract repository and workflows in plain language, scoped to your permissions.",
    category: "contract-lifecycle",
    plugins: ["commercial-legal"],
    authModel: "oauth",
    status: "available",
    accessNote: "Requires an Ironclad account.",
    canEnumerate: false,
  },
  {
    serverId: "docusign-mcp",
    displayName: "DocuSign",
    toolPrefix: "docusign",
    endpoint: "https://mcp.docusign.com/mcp",
    description: "Agreement search, status tracking, and signature workflows.",
    category: "contract-lifecycle",
    plugins: ["commercial-legal"],
    authModel: "oauth",
    status: "available",
    accessNote: "Requires a DocuSign account.",
    canEnumerate: false,
  },
  {
    serverId: "definely-mcp",
    displayName: "Definely",
    toolPrefix: "definely",
    endpoint: "https://mcp.uk.definely.com/api/proxy/core-mcp",
    description:
      "Live access to contract structure: resolve definitions, validate cross references, and run structural diffs.",
    category: "contract-lifecycle",
    plugins: ["commercial-legal", "corporate-legal"],
    authModel: "oauth",
    status: "available",
    accessNote: "Requires a Definely account.",
    canEnumerate: false,
  },

  // Document management ------------------------------------------------------
  {
    serverId: "imanage-mcp",
    displayName: "iManage",
    toolPrefix: "imanage",
    endpoint: "https://cloudimanage.com/mcp/work",
    description:
      "Governed iManage content: documents stay in iManage, and access is permission bound and auditable.",
    category: "document-management",
    plugins: ["commercial-legal", "corporate-legal"],
    authModel: "oauth",
    status: "available",
    accessNote: "Requires an iManage account.",
    canEnumerate: false,
  },
  {
    serverId: "box-mcp",
    displayName: "Box",
    toolPrefix: "box",
    endpoint: "https://mcp.box.com/mcp",
    description: "Data room and document management.",
    category: "document-management",
    plugins: ["corporate-legal"],
    authModel: "oauth",
    status: "available",
    accessNote: "Requires a Box account.",
    canEnumerate: true,
  },

  // E-discovery --------------------------------------------------------------
  {
    serverId: "everlaw-mcp",
    displayName: "Everlaw",
    toolPrefix: "everlaw",
    endpoint: "https://api.everlaw.com/v1/mcp",
    description:
      "Search, organize, and retrieve documents from your Everlaw projects, with review links.",
    category: "e-discovery",
    plugins: ["litigation-legal"],
    authModel: "oauth",
    status: "available",
    accessNote: "Requires an Everlaw account.",
    canEnumerate: false,
  },
  {
    serverId: "aurora-mcp",
    displayName: "Aurora",
    toolPrefix: "aurora",
    endpoint: "https://mcp.ai.consilio.com",
    description:
      "Read-only Consilio ediscovery: find matters, search across workspaces, and run cross-matter investigations with every record cited to source.",
    category: "e-discovery",
    plugins: ["litigation-legal"],
    authModel: "oauth",
    status: "available",
    accessNote: "Requires a Consilio Aurora account.",
    canEnumerate: false,
  },

  // Court data ----------------------------------------------------------------
  {
    serverId: "courtlistener-mcp",
    displayName: "CourtListener",
    toolPrefix: "courtlistener",
    endpoint: "https://mcp.courtlistener.com/",
    description:
      "The Free Law Project's research platform: millions of U.S. court opinions, PACER dockets, judge profiles, and citation checks.",
    category: "court-data",
    plugins: ["ip-legal", "law-student", "legal-clinic", "litigation-legal"],
    authModel: "oauth",
    status: "available",
    accessNote:
      "Free public court data; connecting takes a free CourtListener account.",
    canEnumerate: false,
  },
  {
    serverId: "trellis-mcp",
    displayName: "Trellis",
    toolPrefix: "trellis",
    endpoint: "https://mcp.trellis.law/anthropic",
    description:
      "State trial court data: dockets, rulings, verdicts, filings, and judge and opposing counsel analytics.",
    category: "court-data",
    plugins: ["litigation-legal"],
    authModel: "oauth",
    status: "available",
    accessNote: "Requires a Trellis account.",
    canEnumerate: false,
  },

  // Legal research -------------------------------------------------------------
  {
    serverId: "descrybe-mcp",
    displayName: "Descrybe",
    toolPrefix: "descrybe",
    endpoint: "https://mcp.descrybe.com/mcp",
    description:
      "Primary law research: search cases by concept, trace citations, extract authorities, and verify quoted language.",
    category: "legal-research",
    plugins: ["ip-legal", "law-student", "legal-clinic"],
    authModel: "oauth",
    status: "available",
    accessNote: "Requires a Descrybe account.",
    canEnumerate: false,
  },
  {
    serverId: "solve-intelligence-mcp",
    displayName: "Solve Intelligence",
    toolPrefix: "solve_intelligence",
    endpoint: "https://api.solveintelligence.com/mcp/",
    description:
      "Patent workflows: search patent and non-patent literature, technical standards, prior art, and claim analysis.",
    category: "legal-research",
    plugins: ["corporate-legal", "ip-legal"],
    authModel: "oauth",
    status: "available",
    accessNote: "Requires a Solve Intelligence account.",
    canEnumerate: false,
  },
  {
    serverId: "courtroom5-mcp",
    displayName: "Courtroom5",
    toolPrefix: "courtroom5",
    endpoint: "https://mcp.courtroom5.com",
    description:
      "Jurisdiction-aware procedural guidance: case intake, deadline calculations, and next steps.",
    category: "legal-research",
    plugins: ["legal-clinic"],
    authModel: "oauth",
    status: "available",
    accessNote: "Requires a Courtroom5 account.",
    canEnumerate: false,
  },

  // Outside counsel ------------------------------------------------------------
  {
    serverId: "topcounsel-mcp",
    displayName: "TopCounsel",
    toolPrefix: "topcounsel",
    endpoint: "https://api.techgc.co/api/mcp/topcounsel",
    description:
      "Outside counsel recommendations from The L Suite: community sentiment, rankings, and expertise evidence.",
    category: "counsel-network",
    plugins: ["commercial-legal", "corporate-legal", "litigation-legal"],
    authModel: "oauth",
    status: "available",
    accessNote: "Requires a TopCounsel account.",
    canEnumerate: false,
  },

  // Skill libraries -------------------------------------------------------------
  {
    serverId: "lawve-mcp",
    displayName: "Lawve AI",
    toolPrefix: "lawve",
    endpoint: "https://mcp.lawve.ai/mcp",
    description:
      "A curated library of legal AI skills written by practicing lawyers and legal technologists.",
    category: "skills-library",
    plugins: ["legal-builder-hub"],
    authModel: "oauth",
    status: "available",
    accessNote: "Requires a Lawve AI account.",
    canEnumerate: false,
  },

  // Productivity ----------------------------------------------------------------
  {
    serverId: "slack-mcp",
    displayName: "Slack",
    toolPrefix: "slack",
    endpoint: "https://mcp.slack.com/mcp",
    description:
      "Search messages, read channels, and find discussions across your workspace.",
    category: "productivity",
    plugins: ALL_TWELVE_PLUGINS,
    authModel: "oauth",
    status: "available",
    accessNote: "Requires your organization's Slack workspace.",
    canEnumerate: false,
  },
  {
    serverId: "linear-mcp",
    displayName: "Linear",
    toolPrefix: "linear",
    endpoint: "https://mcp.linear.app/mcp",
    description: "Issue tracking and project management.",
    category: "productivity",
    plugins: ["product-legal"],
    authModel: "oauth",
    status: "available",
    accessNote: "Requires a Linear workspace.",
    canEnumerate: false,
  },
  {
    serverId: "atlassian-mcp",
    displayName: "Atlassian",
    toolPrefix: "atlassian",
    endpoint: "https://mcp.atlassian.com/v1/sse",
    description: "Jira issues and Confluence pages.",
    category: "productivity",
    plugins: ["product-legal"],
    authModel: "oauth",
    status: "available",
    accessNote: "Requires an Atlassian account.",
    canEnumerate: false,
  },
  {
    serverId: "asana-mcp",
    displayName: "Asana",
    toolPrefix: "asana",
    endpoint: "https://mcp.asana.com/sse",
    description: "Tasks and project tracking.",
    category: "productivity",
    plugins: ["product-legal"],
    authModel: "oauth",
    status: "available",
    accessNote: "Requires an Asana account.",
    canEnumerate: false,
  },
];

/** Friendly labels for the C4L plugin slugs, for practice-area display. */
const PLUGIN_PRACTICE_LABELS: Record<string, string> = {
  "ai-governance-legal": "AI governance",
  "commercial-legal": "Commercial",
  "corporate-legal": "Corporate",
  "employment-legal": "Employment",
  "ip-legal": "IP",
  "law-student": "Law student",
  "legal-builder-hub": "Builder hub",
  "legal-clinic": "Legal clinic",
  "litigation-legal": "Litigation",
  "privacy-legal": "Privacy",
  "product-legal": "Product",
  "regulatory-legal": "Regulatory",
};

/**
 * A short, readable practice-area summary for a connector's plugin list:
 * friendly labels joined with commas, or "All practice areas" for the
 * suite-wide connectors, so a twelve-item list never renders. Pure.
 */
export function practiceAreasSummary(plugins: string[]): string {
  if (plugins.length >= ALL_TWELVE_PLUGINS.length) return "All practice areas";
  return plugins
    .map((plugin) => PLUGIN_PRACTICE_LABELS[plugin] ?? plugin)
    .join(", ");
}
