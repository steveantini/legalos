/**
 * Capability-grouped connection taxonomy for the settings Connections page
 * (`components/workspace/settings/connections-page.tsx`).
 *
 * Provider-agnostic by design (D-063): connections are grouped by the
 * capability they give the user's agents (File storage, Calendar, Mail,
 * Matter management), not by vendor. A new provider is a data-only change:
 * add an entry to the right group's `providers` array, or a new group if it
 * is a new capability. The page renders entirely from this structure, so the
 * real data layer (a later milestone) can replace these hardcoded entries
 * without any UI rebuild.
 *
 * No connection state lives here yet: every personal provider renders as
 * "not connected" (available) or "available soon" (coming-soon). The single
 * org-level entry is a static example demonstrating the admin-connected
 * visual treatment until real CLM integration ships.
 */

export type Provider = {
  /** Unique key within its group, e.g. "google-drive". */
  id: string;
  /** Display name, e.g. "Google Drive". */
  name: string;
  /**
   * "available": the user can connect it now (visually; OAuth is not wired
   * until a later milestone). "coming-soon": a future provider, typography
   * only, no affordance.
   */
  status: "available" | "coming-soon";
  /**
   * "personal": the user connects their own account. "org": the organization
   * connects on the user's behalf (admin-managed, informational to the user).
   */
  scope: "personal" | "org";
};

export type CapabilityGroup = {
  /** Unique key, e.g. "file-storage". */
  id: string;
  /** Display title at workspace-section heading scale, e.g. "File storage". */
  title: string;
  /** Editorial group description, including any group-level policy note. */
  description: string;
  /** Personal providers in this group. */
  providers: Provider[];
  /**
   * Optional static example of an org-level connection (Matter management for
   * now). Rendered with the admin-connected visual treatment; replaced by real
   * data when CLM integration ships.
   */
  orgExample?: Provider;
};

export const CAPABILITY_GROUPS: ReadonlyArray<CapabilityGroup> = [
  {
    id: "file-storage",
    title: "File storage",
    description:
      "Documents your agents reference when drafting. Your org allows read-only by default; write requires admin approval.",
    providers: [
      {
        id: "google-drive",
        name: "Google Drive",
        status: "available",
        scope: "personal",
      },
      {
        // id stays vendor-qualified (internal); display name matches real
        // usage ("OneDrive", not "Microsoft OneDrive").
        id: "microsoft-onedrive",
        name: "OneDrive",
        status: "coming-soon",
        scope: "personal",
      },
    ],
  },
  {
    id: "calendar",
    title: "Calendar",
    description:
      "Your day’s schedule, surfaced on Home. Read-only; legalOS never writes to your calendar.",
    providers: [
      {
        id: "google-calendar",
        name: "Google Calendar",
        status: "available",
        scope: "personal",
      },
      {
        id: "outlook-calendar",
        name: "Outlook Calendar",
        status: "coming-soon",
        scope: "personal",
      },
    ],
  },
  {
    id: "mail",
    title: "Mail",
    description:
      "Inbox context for your agents; outbound drafts on your approval.",
    providers: [
      { id: "gmail", name: "Gmail", status: "available", scope: "personal" },
      {
        id: "outlook-mail",
        name: "Outlook",
        status: "coming-soon",
        scope: "personal",
      },
    ],
  },
  {
    id: "messaging",
    title: "Messaging",
    description:
      "Conversations your agents can reference, and a place to send their output. Read and write on your approval.",
    providers: [
      { id: "slack", name: "Slack", status: "available", scope: "personal" },
      {
        // Full product name kept: "Teams" alone is ambiguous, "Microsoft
        // Teams" is how people refer to it (unlike "OneDrive").
        id: "microsoft-teams",
        name: "Microsoft Teams",
        status: "coming-soon",
        scope: "personal",
      },
    ],
  },
  {
    id: "matter-management",
    title: "Matter management",
    description:
      "Provided by your organization. Matters and deals flow from here into your work.",
    providers: [],
    orgExample: {
      id: "ironclad-example",
      name: "Ironclad",
      status: "available",
      scope: "org",
    },
  },
];
