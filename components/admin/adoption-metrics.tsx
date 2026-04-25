"use client";

import { useEffect, useMemo, useState } from "react";

import { readAgentEvents, type AgentClickEvent } from "@/lib/analytics/events";

const DAY_MS = 24 * 60 * 60 * 1000;
const EMPTY_COPY =
  "No agent activity recorded yet. Click an agent card from a department launchpad to generate events.";

interface TopAgentRow {
  agentId: string;
  agentName: string;
  count: number;
}

interface DailyRow {
  dateKey: string; // YYYY-MM-DD
  label: string; // e.g. "Thu, Apr 24"
  count: number;
}

function topAgents(events: AgentClickEvent[]): TopAgentRow[] {
  const counts = new Map<string, TopAgentRow>();
  for (const event of events) {
    const existing = counts.get(event.agentId);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(event.agentId, {
        agentId: event.agentId,
        agentName: event.agentName,
        count: 1,
      });
    }
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function lastSevenDays(events: AgentClickEvent[]): {
  total: number;
  days: DailyRow[];
} {
  const now = Date.now();
  const cutoff = now - 7 * DAY_MS;
  const buckets = new Map<string, DailyRow>();

  // Seed the last 7 days so empty days still show.
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now - i * DAY_MS);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, {
      dateKey: key,
      label: d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      count: 0,
    });
  }

  let total = 0;
  for (const event of events) {
    const t = Date.parse(event.timestamp);
    if (Number.isNaN(t) || t < cutoff) continue;
    const key = new Date(t).toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count += 1;
      total += 1;
    }
  }

  return { total, days: Array.from(buckets.values()) };
}

export function AdoptionMetrics() {
  const [events, setEvents] = useState<AgentClickEvent[] | null>(null);

  useEffect(() => {
    setEvents(readAgentEvents());
  }, []);

  const top = useMemo(() => (events ? topAgents(events) : []), [events]);
  const weekly = useMemo(
    () => (events ? lastSevenDays(events) : { total: 0, days: [] }),
    [events],
  );

  // Render a skeleton-equivalent on first SSR pass; hydration populates.
  if (events === null) {
    return <p className="mt-6 text-sm text-muted-foreground">Loading…</p>;
  }

  const hasEvents = events.length > 0;

  return (
    <div className="mt-8 space-y-8">
      <section aria-labelledby="top-agents-heading">
        <h2
          id="top-agents-heading"
          className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Top agents by click count
        </h2>
        {top.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{EMPTY_COPY}</p>
        ) : (
          <table className="mt-3 w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="border-b border-border pb-2 font-medium">Rank</th>
                <th className="border-b border-border pb-2 font-medium">Agent</th>
                <th className="border-b border-border pb-2 text-right font-medium">
                  Clicks
                </th>
              </tr>
            </thead>
            <tbody>
              {top.map((row, i) => (
                <tr key={row.agentId}>
                  <td className="border-b border-border py-2 pr-4 text-muted-foreground">
                    {i + 1}
                  </td>
                  <td className="border-b border-border py-2 pr-4">
                    {row.agentName}
                  </td>
                  <td className="border-b border-border py-2 text-right">
                    {row.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="weekly-heading">
        <h2
          id="weekly-heading"
          className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Last 7 days
        </h2>
        <p className="mt-3 text-sm">
          <span className="font-medium text-foreground">
            {weekly.total}
          </span>{" "}
          <span className="text-muted-foreground">
            {weekly.total === 1 ? "click" : "clicks"}
          </span>
        </p>
        {!hasEvents ? (
          <p className="mt-3 text-sm text-muted-foreground">{EMPTY_COPY}</p>
        ) : (
          <table className="mt-3 w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="border-b border-border pb-2 font-medium">Day</th>
                <th className="border-b border-border pb-2 text-right font-medium">
                  Clicks
                </th>
              </tr>
            </thead>
            <tbody>
              {weekly.days.map((day) => (
                <tr key={day.dateKey}>
                  <td className="border-b border-border py-2 pr-4">{day.label}</td>
                  <td className="border-b border-border py-2 text-right">
                    {day.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
