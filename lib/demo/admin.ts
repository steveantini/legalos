/**
 * Pure logic for the demo-access admin surface and the time-window link model
 * (D-166). Kept free of I/O so window resolution, label normalization, expiry
 * computation, and the list display-status derivation are unit-tested with
 * plain values. Shared by the platform server actions, the /demo consume route,
 * and the mint script — one source of truth for "what a window means".
 */

/** The mint windows the platform UI offers, in days. 14 is the default: long
 * enough for a real evaluation, short enough to bound a leaked link (the
 * time-window tradeoff softens single-use's "leaked link is burned" property,
 * mitigated by this shorter default, revoke, and per-org scoping — D-136). */
export const DEMO_WINDOW_OPTIONS = [7, 14, 30] as const;
export type DemoWindowDays = (typeof DEMO_WINDOW_OPTIONS)[number];
export const DEMO_DEFAULT_WINDOW_DAYS: DemoWindowDays = 14;

/** Validate a window choice against the allowlist; anything else falls back to
 * the 14-day default. Never trust a client-supplied number. */
export function resolveDemoWindowDays(input: unknown): DemoWindowDays {
  const n = typeof input === "string" ? Number(input) : input;
  return (DEMO_WINDOW_OPTIONS as readonly number[]).includes(n as number)
    ? (n as DemoWindowDays)
    : DEMO_DEFAULT_WINDOW_DAYS;
}

/** Absolute expiry for a freshly minted link: now + window days, as ISO. */
export function computeDemoExpiry(nowMs: number, days: number): string {
  return new Date(nowMs + days * 24 * 60 * 60 * 1000).toISOString();
}

/** Cap the free-text label so the list stays scannable and the column never
 * holds an essay. */
export const DEMO_LABEL_MAX_LENGTH = 120;

/** Normalize the operator's free-text label: trim, collapse empty to null, cap
 * length. A label is a record-keeping note ("Acme Corp – GC"), never markup. */
export function normalizeDemoLabel(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, DEMO_LABEL_MAX_LENGTH);
}

/** A demo link's lifecycle state as shown in the list. Derived, not stored:
 * only 'revoked' is a stored flag; active vs expired is purely the clock. */
export type DemoLinkDisplayStatus = "active" | "expired" | "revoked";

export interface DemoInvitationStatusInput {
  /** Stored status: 'active' | 'revoked' (+ legacy 'pending' | 'consumed'). */
  status: string;
  /** ISO timestamp. */
  expires_at: string;
}

/** Derive the display status from the stored flag plus the clock. */
export function demoLinkDisplayStatus(
  row: DemoInvitationStatusInput,
  nowMs: number,
): DemoLinkDisplayStatus {
  if (row.status === "revoked") return "revoked";
  if (new Date(row.expires_at).getTime() <= nowMs) return "expired";
  return "active";
}

/**
 * One invitation as the platform list renders it. Lives here (not in the
 * "use server" actions module, which may export only async functions — D-072)
 * so both the page and the client manager import it.
 */
export interface DemoInvitationView {
  id: string;
  label: string | null;
  displayStatus: DemoLinkDisplayStatus;
  /** ISO timestamps. */
  createdAt: string;
  expiresAt: string;
  lastAccessedAt: string | null;
}

/** Result of minting a link. The raw url is returned ONCE (only the hash is
 * stored), so the client shows it then discards it. */
export type MintDemoLinkResult =
  | { ok: true; url: string; label: string | null; expiresAt: string }
  | { ok: false; error: string };

/** Result of revoking a link. */
export type RevokeDemoLinkResult = { ok: true } | { ok: false; error: string };
