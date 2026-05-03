"use client";

/**
 * Adoption Metrics — top-level orchestrator. Replaces the prior
 * paraphrased view (deleted in this same commit) under D-019
 * (Constraint C) and D-021. Renders the data-source toggle, the 5-card
 * metric grid, the Top Users table, the Clicks per Agent panel, the
 * two detail modals, and the back-to-top button — all from the source
 * (admin.html lines ~932–1112, 1182–1252, plus the user/agent modal
 * logic later in the file).
 *
 * Data sources:
 * - Sample mode: `lib/metrics/sample-data.ts` — deterministic fixtures
 *   keyed by period.
 * - Real mode: `lib/metrics/real-data.ts` — projections of
 *   `AgentClickEvent[]` from `lib/analytics/events.ts` (D-010 sink,
 *   preserved per D-020). User-dependent surfaces return empty in
 *   real mode (Q1 of the Session 6 plan).
 *
 * Mode is persisted to localStorage under `launchpad_metrics_data_source`
 * so a forker who set "real" once doesn't have to re-toggle on every
 * navigation.
 */

import { useEffect, useState } from "react";

import { readAgentEvents, type AgentClickEvent } from "@/lib/analytics/events";
import {
  agentUsageData,
  clicksData,
  sampleMetricCards,
  topUsersData,
  userInteractionData,
} from "@/lib/metrics/sample-data";
import {
  realAgentDetails,
  realClicksPerAgent,
  realMetricCards,
  realTopUsers,
  realUserDetails,
} from "@/lib/metrics/real-data";
import type {
  ClicksRow,
  InteractionRow,
  MetricCardsData,
  Period,
  TopUserRow,
  UsageRow,
} from "@/lib/metrics/types";

import { AgentDetailModal } from "./agent-detail-modal";
import { ClicksPerAgent } from "./clicks-per-agent";
import { DataSourceToggle, type DataSourceMode } from "./data-source-toggle";
import { MetricCardsGrid } from "./metric-cards-grid";
import { TopUsersTable } from "./top-users-table";
import { UserDetailModal } from "./user-detail-modal";

const MODE_KEY = "launchpad_metrics_data_source";

function loadMode(): DataSourceMode {
  if (typeof window === "undefined") return "sample";
  try {
    const raw = window.localStorage.getItem(MODE_KEY);
    return raw === "real" ? "real" : "sample";
  } catch {
    return "sample";
  }
}

function saveMode(mode: DataSourceMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    // best-effort persistence; ignore quota / privacy-mode failures
  }
}

export function AdoptionMetrics() {
  const [mode, setMode] = useState<DataSourceMode>("sample");
  const [events, setEvents] = useState<AgentClickEvent[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(loadMode());
    setEvents(readAgentEvents());
    setHydrated(true);
  }, []);

  function handleModeChange(next: DataSourceMode) {
    setMode(next);
    saveMode(next);
    if (next === "real") {
      // Re-read events on every flip into real mode in case the user
      // generated more clicks since the last load.
      setEvents(readAgentEvents());
    }
  }

  // Lookups, dispatched on mode. Children call these without knowing
  // about modes; they just receive data shaped per the types.
  function topUsersFor(period: Period): TopUserRow[] {
    return mode === "sample" ? topUsersData[period] : realTopUsers();
  }

  function clicksFor(period: Period): ClicksRow[] {
    return mode === "sample"
      ? clicksData[period]
      : realClicksPerAgent(events, period);
  }

  function userRowsFor(userEmail: string, period: Period): InteractionRow[] {
    if (mode === "sample") {
      return userInteractionData[userEmail]?.[period] ?? [];
    }
    return realUserDetails();
  }

  function agentRowsFor(agentName: string, period: Period): UsageRow[] {
    if (mode === "sample") {
      return agentUsageData[agentName]?.[period] ?? [];
    }
    return realAgentDetails(events, agentName, period);
  }

  const metricData: MetricCardsData =
    mode === "sample" ? sampleMetricCards : realMetricCards(events);

  // Real mode with zero events: bucket-aware totals are also zero.
  // Components handle their own empty states based on the data they
  // receive; nothing to special-case here.

  if (!hydrated) {
    // Avoid SSR hydration mismatch. The mode and events both come from
    // localStorage which doesn't exist server-side.
    return <div aria-busy="true" className="mt-8 h-32" />;
  }

  return (
    <div className="mt-8 space-y-8">
      <DataSourceToggle mode={mode} onChange={handleModeChange} />

      <MetricCardsGrid data={metricData} />

      <TopUsersTable
        rowsFor={topUsersFor}
        onUserClick={setSelectedUser}
        mode={mode}
      />

      <ClicksPerAgent
        rowsFor={clicksFor}
        onAgentClick={setSelectedAgent}
        mode={mode}
      />

      <UserDetailModal
        user={selectedUser}
        rowsFor={userRowsFor}
        onClose={() => setSelectedUser(null)}
      />

      <AgentDetailModal
        agent={selectedAgent}
        rowsFor={agentRowsFor}
        onClose={() => setSelectedAgent(null)}
      />
    </div>
  );
}
