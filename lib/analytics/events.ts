"use client";

/**
 * localStorage-backed event logger for Phase 1 (per `DECISION_LOG.md` D-010).
 *
 * Writes are best-effort and MUST NEVER throw. localStorage can be disabled
 * (private browsing), quota can be exceeded, and stored JSON can be
 * corrupted by unrelated code — none of those should interrupt user
 * navigation. Every failure path console-warns and returns.
 *
 * Phase 2 (also per D-010) promotes this to a Supabase `analytics_events`
 * table. The event shape below is deliberately close to the eventual DB
 * row so the Phase 2 change is mostly a sink swap and not a rewrite.
 */

const STORAGE_KEY = "launchpad_events";
const MAX_EVENTS = 500;

export interface AgentClickEvent {
  type: "agent_click";
  agentId: string;
  agentSlug: string;
  agentName: string;
  departmentSlug: string;
  timestamp: string;
}

export function logAgentClick(
  event: Omit<AgentClickEvent, "type" | "timestamp">,
): void {
  if (typeof window === "undefined") return;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const list: AgentClickEvent[] = Array.isArray(parsed)
      ? (parsed as AgentClickEvent[])
      : [];
    const newEvent: AgentClickEvent = {
      ...event,
      type: "agent_click",
      timestamp: new Date().toISOString(),
    };
    const next = [...list, newEvent].slice(-MAX_EVENTS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn(
      "logAgentClick failed",
      err instanceof Error ? err.message : String(err),
    );
  }
}

export function readAgentEvents(): AgentClickEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as AgentClickEvent[]) : [];
  } catch (err) {
    console.warn(
      "readAgentEvents failed",
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }
}
