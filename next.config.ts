import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep pdf-parse out of the server bundle. pdf-parse delegates to
  // pdfjs-dist which dynamically imports a sibling pdf.worker.mjs at
  // runtime; Turbopack bundles the main pdf.mjs but not the worker, so
  // every PDF parse fails with "Setting up fake worker failed: Cannot
  // find module ...pdf.worker.mjs". Externalizing pdf-parse lets Node's
  // native module resolver find the worker file in node_modules where
  // pdf-parse expects it.
  serverExternalPackages: ["pdf-parse"],
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
