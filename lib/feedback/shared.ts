/**
 * Shared types and copy for the in-product feedback foundation (Step One).
 * Imported by both the client (the submit form, the review surface) and the
 * server (the action, the data layer), so this module is free of "server-only"
 * and holds only types, the small enums, and the brand copy.
 *
 * Design principle (recorded in DECISION_LOG): feedback is HELD AND RESPECTED.
 * The affordance is present, not pushy; the form is near-frictionless; the
 * acknowledgment is gracious; the owner-side review is calm, not anxious.
 */

export const FEEDBACK_KINDS = ["bug", "idea", "confusion", "other"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_STATUSES = [
  "new",
  "seen",
  "in_progress",
  "resolved",
  "wont_fix",
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/**
 * The optional, gentle type selector offered in the form. Warm, plain-language
 * labels that map to the stored `kind`; never demanded, defaults to 'other' when
 * untouched. ('other' is the default and is not offered as a pill.)
 */
export const FEEDBACK_KIND_OPTIONS: ReadonlyArray<{
  value: Exclude<FeedbackKind, "other">;
  label: string;
}> = [
  { value: "bug", label: "Something's off" },
  { value: "idea", label: "An idea" },
  { value: "confusion", label: "Not sure about this" },
];

/** The acknowledgment shown after a successful submit — the brand's voice, the
 * last thing the user sees. Held as a constant so the copy has one home. */
export const FEEDBACK_ACKNOWLEDGMENT =
  "Received, with thanks. We read every note that comes through, and they shape what we build next.";

/** Bounds shared by the form and the server validator so they cannot disagree. */
export const FEEDBACK_MESSAGE_MIN = 1;
export const FEEDBACK_MESSAGE_MAX = 4000;

/** Calm, plain-language status labels for the review surface. */
export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "New",
  seen: "Seen",
  in_progress: "In progress",
  resolved: "Resolved",
  wont_fix: "Won't fix",
};

/** One feedback note as the platform review surface renders it. */
export type FeedbackView = {
  id: string;
  message: string;
  kind: FeedbackKind;
  status: FeedbackStatus;
  /** Server-stamped context (route, role, userAgent, app commit, ...). */
  context: Record<string, unknown>;
  submitterName: string;
  submitterEmail: string;
  organizationName: string;
  createdAt: string;
};
