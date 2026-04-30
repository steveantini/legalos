import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
