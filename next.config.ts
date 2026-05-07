import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF extraction is now `unpdf` (lib/extract/pdf.ts). It ships a
  // serverless-tuned PDF.js build with no native dependencies and no
  // dynamic requires, so no externalize is needed.
  //
  // Historical context: prior to Session 22, `pdf-parse` was used. It
  // pulled in `pdfjs-dist` which lazy-required `@napi-rs/canvas` via
  // `createRequire(import.meta.url)`. Two failures stacked:
  //
  //   1. Turbopack bundled `pdfjs-dist`'s main entry but not its sibling
  //      `pdf.worker.mjs`, so PDF parses failed with "Setting up fake
  //      worker failed: Cannot find module …pdf.worker.mjs".
  //   2. `@napi-rs/canvas` is a platform-specific native module whose
  //      `.node` binding cannot be bundled. On Vercel's Linux x64
  //      functions every POST /workspace/agents/new returned 500 with
  //      "Cannot load \"@napi-rs/canvas-…\"" before the action body
  //      could run.
  //
  // `serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"]`
  // was tried as a workaround. It externalized the bundling but Vercel's
  // static file tracer can't follow `createRequire`-built requires, so
  // `@napi-rs/canvas` never made it into the function output's
  // node_modules. Switching to `unpdf` removed the entire chain.
  experimental: {
    serverActions: {
      // Permanent agent attachments are uploaded via server actions (Session
      // 8h). The 20MB per-file cap matches the agent-attachments storage
      // bucket's file_size_limit; this body limit is sized to clear that
      // with headroom for multipart overhead. Other server actions are
      // small (FormData with text fields only) and unaffected.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
