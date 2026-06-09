import { z } from "zod";

import { calculatorConfig } from "@/config/site";

/**
 * The org-scoped task book (productivity calculator Step A).
 *
 * Two shapes live here:
 *   - TaskBookConfig — the PERSISTED, numeric shape stored as JSONB per org
 *     (migration 0069) and validated by `taskBookSchema`. It holds only the
 *     HUMAN-SUPPLIED assumptions; measured run volumes are never stored (they are
 *     read live from usage_events).
 *   - DraftConfig — the string-form the inputs bind to in the editor, so partly
 *     typed values don't fight number coercion. `toDraft` / `toNumeric` convert
 *     between the two; `toNumeric` is what gets validated and saved.
 *
 * A task type optionally maps to an agent (`agentId`). When mapped, its run
 * volume is MEASURED from that agent's usage; when not, the editor supplies a
 * `manualRunsPerYear` ESTIMATE. The per-run time-without/time-with and the
 * salaries are always estimates.
 */

export interface MemberConfig {
  id: string;
  name: string;
  salary: number;
}

export interface TaskTypeConfig {
  id: string;
  label: string;
  /** A tracked agent's id when the volume is measured; null for a manual estimate. */
  agentId: string | null;
  /** Per-run estimates, in minutes. */
  timeWithoutMinutes: number;
  timeWithMinutes: number;
  /** Estimated annual runs when `agentId` is null; null when measured. */
  manualRunsPerYear: number | null;
}

export interface TaskBookConfig {
  costPerUserPerYear: number;
  members: MemberConfig[];
  taskTypes: TaskTypeConfig[];
}

const memberSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  salary: z.number().nonnegative().finite(),
});

const taskTypeSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  agentId: z.string().uuid().nullable(),
  timeWithoutMinutes: z.number().nonnegative().finite(),
  timeWithMinutes: z.number().nonnegative().finite(),
  manualRunsPerYear: z.number().nonnegative().finite().nullable(),
});

export const taskBookSchema = z.object({
  costPerUserPerYear: z.number().nonnegative().finite(),
  members: z.array(memberSchema),
  taskTypes: z.array(taskTypeSchema),
});

export function defaultTaskBookConfig(): TaskBookConfig {
  return {
    costPerUserPerYear: calculatorConfig.costPerUserPerYear,
    members: [],
    taskTypes: [],
  };
}

export function parseTaskBookConfig(value: unknown): TaskBookConfig | null {
  const result = taskBookSchema.safeParse(value);
  return result.success ? result.data : null;
}

// ── Draft (string-form) shape and converters ──

export interface DraftMember {
  id: string;
  name: string;
  salary: string;
}

export interface DraftTaskType {
  id: string;
  label: string;
  agentId: string | null;
  timeWithoutMinutes: string;
  timeWithMinutes: string;
  manualRunsPerYear: string;
}

export interface DraftConfig {
  costPerUserPerYear: string;
  members: DraftMember[];
  taskTypes: DraftTaskType[];
}

/** Show an empty field for a zero so the placeholder shows; otherwise the value. */
function numToInput(n: number): string {
  return n === 0 ? "" : String(n);
}

function inputToFloat(s: string): number {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function inputToInt(s: string): number {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function toDraft(config: TaskBookConfig): DraftConfig {
  return {
    // Cost shows its real value (incl. the default), not blanked at zero.
    costPerUserPerYear: String(config.costPerUserPerYear),
    members: config.members.map((m) => ({
      id: m.id,
      name: m.name,
      salary: numToInput(m.salary),
    })),
    taskTypes: config.taskTypes.map((t) => ({
      id: t.id,
      label: t.label,
      agentId: t.agentId,
      timeWithoutMinutes: numToInput(t.timeWithoutMinutes),
      timeWithMinutes: numToInput(t.timeWithMinutes),
      manualRunsPerYear: t.manualRunsPerYear === null ? "" : numToInput(t.manualRunsPerYear),
    })),
  };
}

export function toNumeric(draft: DraftConfig): TaskBookConfig {
  return {
    costPerUserPerYear: inputToFloat(draft.costPerUserPerYear),
    members: draft.members.map((m) => ({
      id: m.id,
      name: m.name.trim(),
      salary: inputToFloat(m.salary),
    })),
    taskTypes: draft.taskTypes.map((t) => ({
      id: t.id,
      label: t.label.trim(),
      agentId: t.agentId,
      timeWithoutMinutes: inputToFloat(t.timeWithoutMinutes),
      timeWithMinutes: inputToFloat(t.timeWithMinutes),
      // A measured (agent-mapped) task type carries no manual count.
      manualRunsPerYear: t.agentId ? null : inputToInt(t.manualRunsPerYear),
    })),
  };
}
