"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type DataSourceMode = "sample" | "real";

interface DataSourceToggleProps {
  mode: DataSourceMode;
  onChange: (mode: DataSourceMode) => void;
}

const SAMPLE_COPY = "Showing sample data for demonstration.";
const REAL_COPY = "Showing your agent click events from this browser's localStorage.";

/**
 * Toggle between sample-data demo mode and real localStorage events.
 * Per D-021, this completes the original admin.html's intended real-data
 * path (`isApiConnected` was hardcoded false; the API path was never
 * connected). The toggle exposes the conceptual split that was implicit
 * in the source's architecture.
 *
 * Inline mode-status copy distinguishes the two sources unambiguously
 * so a forker can never misread which data they're seeing. The
 * route-page-level localStorage-disclosure paragraph (preserved per
 * D-020) documents the broader Phase 1 limitation; this status copy
 * documents the immediate selection.
 */
export function DataSourceToggle({ mode, onChange }: DataSourceToggleProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <Tabs value={mode} onValueChange={(v) => onChange(v as DataSourceMode)}>
        <TabsList>
          <TabsTrigger value="sample">Sample data</TabsTrigger>
          <TabsTrigger value="real">My data</TabsTrigger>
        </TabsList>
      </Tabs>
      <p className="text-sm text-muted-foreground">
        {mode === "sample" ? SAMPLE_COPY : REAL_COPY}
      </p>
    </div>
  );
}
