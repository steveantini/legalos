/**
 * The in-product help mapping (Documentation arc Step 2, D-158): one
 * declarative map from help topic to its public documentation page, consumed
 * by the shared <HelpLink> affordance each workspace surface places in its
 * header. A future guide rename is one edit here; the topic union makes a
 * dead link a compile error rather than a runtime 404, and a test pins every
 * href to a real guide slug (lib/marketing/documentation.tsx).
 *
 * Platform-tier surfaces have NO entry by design: their documentation is
 * internal (docs/OPERATOR.md), so they carry no public help link.
 */

export const HELP_TOPICS = {
  /** The launchpad and agent groups (the workspace guide). */
  workspace: "/documentation/workspace",
  /** Chatting with agents: citations, tools, approvals. */
  chat: "/documentation/chat",
  /** Running workflows (the user guide). */
  workflows: "/documentation/workflows",
  /** Building workflows (the administrator guide). */
  "workflows-administration": "/documentation/workflows-administration",
  /** Knowledge and Research as a user sees them. */
  knowledge: "/documentation/knowledge",
  /** Managing collections (the administrator guide). */
  collections: "/documentation/collections",
  /** The home Impact card. */
  impact: "/documentation/impact",
  /** People and roles. */
  people: "/documentation/people",
  /** Policy and access. */
  policy: "/documentation/policy",
  /** Connections and credential custody. */
  connections: "/documentation/connections",
  /** Insights and the calculator. */
  insights: "/documentation/insights",
  /** The audit log. */
  audit: "/documentation/audit",
} as const;

export type HelpTopic = keyof typeof HELP_TOPICS;

export function helpHref(topic: HelpTopic): string {
  return HELP_TOPICS[topic];
}
