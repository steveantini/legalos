/**
 * Safe server-side fetching of arbitrary, user-supplied feed URLs.
 *
 * Fetching a URL a user pasted is a textbook SSRF vector: a malicious or
 * mistaken URL could point the server at internal services, the cloud
 * metadata endpoint, or loopback. The guard here is layered:
 *
 *   1. Protocol allowlist — http/https only (no file:, gopher:, ftp:, etc.).
 *   2. Host classification — literal private/loopback/link-local/ULA IPs and
 *      obvious internal hostnames (localhost, *.local, *.internal, metadata)
 *      are rejected outright.
 *   3. DNS resolution check — a public-looking hostname is resolved and EVERY
 *      returned address is classified, so a name that resolves to a private IP
 *      (the DNS-rebinding move) is rejected before any socket is opened.
 *   4. Manual redirect following — each hop is re-validated through the same
 *      guard (a public URL that 302s to http://169.254.169.254 is stopped at
 *      the redirect), with a small hop cap.
 *
 * Plus hard limits: a connect/read timeout and a response-size cap, so a slow
 * or enormous endpoint can't tie up or exhaust the function.
 *
 * Node runtime only (uses node:dns). Server actions and route handlers run in
 * the Node.js runtime on Vercel Fluid Compute, where outbound fetch and
 * node:dns are available with no extra configuration; this module must never
 * be imported into a client component or an Edge runtime.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Outbound request budget. Conservative so the Desk refresh stays bounded. */
const FETCH_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 3 * 1024 * 1024; // 3 MB is ample for a feed document.
const MAX_REDIRECTS = 4;
const USER_AGENT = "legalOS-DeskFeeds/1.0 (+https://legalos.app)";

/** A blocked-host outcome, surfaced as a typed error the caller maps to "error". */
export class UnsafeFeedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeFeedUrlError";
  }
}

/**
 * Validate a string is a fetchable http(s) feed URL and return its normalized
 * form. Throws UnsafeFeedUrlError on a bad protocol or an obviously internal
 * host. Does NOT resolve DNS (that happens per-hop in safeFetch); this is the
 * cheap synchronous gate the add action runs first.
 */
export function normalizeFeedUrl(input: string): string {
  const trimmed = input.trim();
  // Forgive a missing scheme (the most common paste): default to https. A
  // string that already carries http(s):// is kept; one carrying some OTHER
  // scheme (javascript:, file:, ftp:) is kept so the protocol check below
  // rejects it. The scheme test excludes a dot, so a bare `host.tld:port`
  // (no scheme) is treated as schemeless and gets https, not mistaken for one.
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : /^[a-z][a-z0-9+-]*:/i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new UnsafeFeedUrlError("That doesn't look like a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeFeedUrlError("Only http and https feed URLs are supported.");
  }
  if (isBlockedHostname(url.hostname)) {
    throw new UnsafeFeedUrlError("That address can't be reached.");
  }
  // Strip credentials and fragments; keep the rest verbatim.
  url.username = "";
  url.password = "";
  url.hash = "";
  return url.toString();
}

/**
 * Whether a hostname is an obviously internal target by name or literal IP,
 * checkable without DNS. Pure and unit-tested.
 */
export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host.length === 0) return true;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata" ||
    host === "metadata.google.internal"
  ) {
    return true;
  }
  // Bracketed IPv6 literal from a URL hostname comes without brackets here.
  const ipVersion = isIP(host);
  if (ipVersion !== 0) return isBlockedAddress(host);
  return false;
}

/**
 * Classify a literal IP address (v4 or v6) as private/loopback/link-local/etc.
 * Pure and unit-tested. Covers the ranges an SSRF guard must catch:
 * loopback, RFC1918, link-local (incl. 169.254.169.254 metadata), CGNAT,
 * unspecified, IPv6 loopback/ULA/link-local, and IPv4-mapped IPv6.
 */
export function isBlockedAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedIPv4(ip);
  if (version === 6) return isBlockedIPv6(ip);
  return true; // not a parseable IP — treat as unsafe
}

function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 (unspecified / "this network")
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isBlockedIPv6(ip: string): boolean {
  const addr = ip.toLowerCase().split("%")[0]; // drop any zone id
  if (addr === "::" || addr === "::1") return true; // unspecified, loopback
  // IPv4-mapped/compatible (::ffff:a.b.c.d) — classify the embedded v4.
  const mapped = /^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (mapped) return isBlockedIPv4(mapped[1]);
  if (addr.startsWith("fe80")) return true; // link-local
  if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // ULA fc00::/7
  if (addr.startsWith("ff")) return true; // multicast
  return false;
}

/** The result of a successful safe fetch: the body text and final URL. */
export type SafeFetchResult = { body: string; finalUrl: string };

/**
 * Fetch a URL with the SSRF guard applied at every redirect hop, a timeout,
 * and a response-size cap. Returns the body text, or throws (UnsafeFeedUrlError
 * for a blocked host; a plain Error for network/timeout/size failures).
 */
export async function safeFetch(initialUrl: string): Promise<SafeFetchResult> {
  let current = normalizeFeedUrl(initialUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertResolvedHostSafe(current);

    const res = await fetch(current, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": USER_AGENT, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
    });

    // Follow redirects ourselves so each Location is re-validated.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error("Redirect without a location.");
      current = normalizeFeedUrl(new URL(location, current).toString());
      continue;
    }

    if (!res.ok) throw new Error(`Feed responded ${res.status}.`);
    return { body: await readCapped(res), finalUrl: current };
  }

  throw new Error("Too many redirects.");
}

/** Resolve the URL's hostname and reject if ANY resolved address is internal. */
async function assertResolvedHostSafe(url: string): Promise<void> {
  const host = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  if (isBlockedHostname(host)) {
    throw new UnsafeFeedUrlError("That address can't be reached.");
  }
  if (isIP(host) !== 0) return; // literal IP already vetted by isBlockedHostname

  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new Error("Couldn't resolve that host.");
  }
  if (records.length === 0) throw new Error("Couldn't resolve that host.");
  for (const { address } of records) {
    if (isBlockedAddress(address)) {
      throw new UnsafeFeedUrlError("That address can't be reached.");
    }
  }
}

/** Read a response body, aborting if it exceeds the size cap. */
async function readCapped(res: Response): Promise<string> {
  const declared = Number.parseInt(res.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new Error("Feed is too large.");
  }
  const reader = res.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("Feed is too large.");
      }
      chunks.push(value);
    }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(concat(chunks, total));
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
