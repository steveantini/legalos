import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Demo link unavailable",
};

/**
 * Shown when a /demo/<token> link cannot sign the visitor in — invalid,
 * already used, expired, or any other reason. Deliberately generic (no detail
 * about which) and on-brand, mirroring the marketing coming-soon treatment.
 *
 * This static segment takes precedence over the sibling dynamic `[token]`
 * route, so /demo/unavailable resolves here, not to the consume handler.
 * Public via the proxy's `/demo` allowlist.
 */
export default function DemoUnavailablePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-20 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary">
        Demo
      </p>

      <h1 className="mt-5 text-5xl font-semibold leading-tight tracking-tight text-foreground md:text-6xl">
        This demo link is no longer valid.
      </h1>

      <p className="mt-8 max-w-prose text-base leading-relaxed text-muted-foreground">
        A demo link works until it expires or is revoked. This one may have
        expired or been revoked, so ask whoever shared it with you for a fresh
        one.
      </p>

      <Link
        href="/"
        className="mt-12 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        ← Back to legalOS
      </Link>
    </main>
  );
}
