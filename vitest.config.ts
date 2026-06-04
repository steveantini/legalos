import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Minimal vitest setup for the Phase 2 unit tests (2P-6a). Node environment (the
 * targets are pure server functions, no DOM). Aliases mirror tsconfig's "@/*" path
 * map, and the Next.js "server-only" / "client-only" guard packages are stubbed so
 * the server modules under test import cleanly (their env reads are per-call, never
 * at module load). Tests are discovered by the *.test.ts pattern, so they are never
 * imported by app code and never enter the Next production bundle.
 */
const root = fileURLToPath(new URL(".", import.meta.url)).replace(/\/$/, "");
const emptyModule = `${root}/test/stubs/empty.ts`;

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
  },
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: `${root}/$1` },
      { find: /^server-only$/, replacement: emptyModule },
      { find: /^client-only$/, replacement: emptyModule },
    ],
  },
});
