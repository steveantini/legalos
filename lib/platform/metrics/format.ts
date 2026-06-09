/**
 * Metric-layer format tokens (analytics arc, Step 1).
 *
 * A FormatToken is a STRING, not a function, so a metric definition stays pure
 * data and serializable across any boundary (the design-check's serializability
 * requirement). The render primitives call `formatMetric(value, token)` to turn
 * a raw view value into display text; they never carry formatter functions.
 *
 * Values come straight from the service-role view reads, so a token must accept
 * the union a Postgres view can yield for a cell: a number, a string (text or a
 * timestamptz ISO string), or null. `usd` / `usd4` do the micro-USD → dollars
 * transform (cost is stored as bigint micro-USD, 1,000,000 = $1).
 */

export type FormatToken =
  | "text" // pass-through string (org names, precomputed sub-labels)
  | "int" // whole number, grouped: 1,234
  | "number" // number, grouped, as given
  | "compact" // 1.2k / 3.4m — short magnitude
  | "percent" // a 0..1 ratio rendered as a percentage: 0.667 -> 66.7%
  | "usd" // micro-USD -> $1,234.56
  | "usd4" // micro-USD -> $0.0123 (four fraction digits, for tiny per-call costs)
  | "duration" // milliseconds -> "2.3s" / "1m 4s"
  | "relative-time"; // ISO timestamp -> "3d ago" / "today" / "—"

export type MetricValue = number | string | null;

const NBSP = " ";

/** The single entry point the primitives use. */
export function formatMetric(value: MetricValue, token: FormatToken): string {
  switch (token) {
    case "text":
      return value === null ? "—" : String(value);
    case "int":
      return formatInt(value);
    case "number":
      return formatNumber(value);
    case "compact":
      return formatCompact(value);
    case "percent":
      return formatPercent(value);
    case "usd":
      return formatUsd(value, 2);
    case "usd4":
      return formatUsd(value, 4);
    case "duration":
      return formatDuration(value);
    case "relative-time":
      return formatRelativeTime(value);
  }
}

function toNumber(value: MetricValue): number | null {
  if (value === null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatInt(value: MetricValue): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return Math.round(n).toLocaleString("en-US");
}

function formatNumber(value: MetricValue): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return n.toLocaleString("en-US");
}

/** 1.2k / 3.4m, lowercase suffix per the house spec; exact below 1,000. */
function formatCompact(value: MetricValue): string {
  const n = toNumber(value);
  if (n === null) return "—";
  const abs = Math.abs(n);
  if (abs < 1_000) return Math.round(n).toLocaleString("en-US");
  if (abs < 1_000_000) return `${trim(n / 1_000)}k`;
  if (abs < 1_000_000_000) return `${trim(n / 1_000_000)}m`;
  return `${trim(n / 1_000_000_000)}b`;
}

/** One decimal, but drop a trailing ".0" so 1.0k reads as 1k. */
function trim(n: number): string {
  return Number(n.toFixed(1)).toLocaleString("en-US");
}

/** A 0..1 ratio as a percentage with up to one decimal (50%, 66.7%, 100%). */
function formatPercent(value: MetricValue): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return `${Number((n * 100).toFixed(1)).toLocaleString("en-US")}%`;
}

function formatUsd(value: MetricValue, fractionDigits: number): string {
  const micro = toNumber(value);
  if (micro === null) return "—";
  return (micro / 1_000_000).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/** Milliseconds → "0.4s" / "2.3s" / "1m 4s" / "1h 2m". */
function formatDuration(value: MetricValue): string {
  const ms = toNumber(value);
  if (ms === null) return "—";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) {
    // Sub-minute: one decimal of seconds reads better than a bare integer.
    return `${Number((ms / 1000).toFixed(1)).toLocaleString("en-US")}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m${NBSP}${seconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h${NBSP}${minutes % 60}m`;
}

/**
 * ISO timestamp → calm relative recency. "today" for the current day,
 * "1d ago" … "30d ago" by whole days, then weeks/months for older. null → "—".
 * Rendered server-side, so there is no hydration concern with `now`.
 */
function formatRelativeTime(value: MetricValue): string {
  if (value === null) return "—";
  const then = new Date(String(value)).getTime();
  if (!Number.isFinite(then)) return "—";

  const diffMs = Date.now() - then;
  const day = 24 * 60 * 60 * 1000;
  const days = Math.floor(diffMs / day);

  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 60) return "1mo ago";
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "1y ago" : `${years}y ago`;
}
