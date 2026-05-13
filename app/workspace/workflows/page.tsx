import type { Metadata } from "next";

import { ComingSoonContent } from "@/components/coming-soon/coming-soon";

export const metadata: Metadata = {
  title: "My Workflows",
};

export default function WorkflowsPage() {
  return (
    <ComingSoonContent
      label="My Workflows"
      description="Compose multi-step agentic sequences from natural language. Run them across departments; call them from the assistant. Your authored workflows live here once the surface ships."
    />
  );
}
