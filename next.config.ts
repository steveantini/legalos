import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the pdf-parse → pdfjs-dist → @napi-rs/canvas chain out of the
  // server bundle. Two distinct bundling failures, one fix:
  //
  //   1. pdf-parse delegates to pdfjs-dist which dynamically imports a
  //      sibling pdf.worker.mjs at runtime; Turbopack bundles the main
  //      pdf.mjs but not the worker, so every PDF parse fails with
  //      "Setting up fake worker failed: Cannot find module
  //      ...pdf.worker.mjs".
  //   2. pdfjs-dist transitively requires @napi-rs/canvas, a native
  //      module whose platform-specific .node binding cannot be bundled.
  //      On Vercel's Linux x64 functions this surfaced as
  //      "Cannot load \"@napi-rs/canvas-...\"" at function init,
  //      returning 500 on POST /workspace/agents/new before any action
  //      body could run (Session 22 hotfix).
  //
  // Externalizing all three lets Node's native module resolver find them
  // in node_modules at runtime where their platform bindings and worker
  // files live.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
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
