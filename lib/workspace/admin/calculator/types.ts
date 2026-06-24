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
 * Every task type maps to an agent (`agentId`): its run volume is MEASURED from
 * that agent's usage. There is no manual-estimate volume (D-177) — Impact is
 * measured-only. The per-run time-without/time-with and the salaries are
 * estimates.
 */

export interface MemberConfig {
  id: string;
  name: string;
  salary: number;
}

export interface TaskTypeConfig {
  id: string;
  label: string;
  /** The mapped agent's id; its measured run volume drives this task's savings. */
  agentId: string;
  /** Per-run estimates, in minutes. */
  timeWithoutMinutes: number;
  timeWithMinutes: number;
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

/**
 * WRITE schema: a task type must be agent-mapped (`agentId` non-null). The new
 * UI cannot produce an unmapped task, so this just fails closed on a stray one.
 */
const taskTypeSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  agentId: z.string().uuid(),
  timeWithoutMinutes: z.number().nonnegative().finite(),
  timeWithMinutes: z.number().nonnegative().finite(),
});

export const taskBookSchema = z.object({
  costPerUserPerYear: z.number().nonnegative().finite(),
  members: z.array(memberSchema),
  taskTypes: z.array(taskTypeSchema),
});

/**
 * READ schema: deliberately TOLERANT where the write schema is strict. A legacy
 * row (or another environment) may still hold a manual task (`agentId: null`)
 * and a leftover `manualRunsPerYear` key. The same parse path feeds both the
 * calculator page and the home Impact band and fails closed to the empty book,
 * so we must not let one droppable manual task collapse the whole org's config.
 * We accept `agentId: null` here, then drop those task types in
 * `parseTaskBookConfig` (the leftover `manualRunsPerYear` key is stripped by
 * Zod). Write forbids what read forgives.
 */
const readTaskTypeSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  agentId: z.string().uuid().nullable(),
  timeWithoutMinutes: z.number().nonnegative().finite(),
  timeWithMinutes: z.number().nonnegative().finite(),
});

const readTaskBookSchema = z.object({
  costPerUserPerYear: z.number().nonnegative().finite(),
  members: z.array(memberSchema),
  taskTypes: z.array(readTaskTypeSchema),
});

export function defaultTaskBookConfig(): TaskBookConfig {
  return {
    costPerUserPerYear: calculatorConfig.costPerUserPerYear,
    members: [],
    taskTypes: [],
  };
}

/**
 * Validate stored config, dropping any legacy manual (unmapped) task type rather
 * than rejecting the whole book. Returns `null` only on a GENUINE parse failure
 * (a structurally invalid row), so `getTaskBook` falls back to the empty default
 * only then, never merely because a droppable manual task is present.
 */
export function parseTaskBookConfig(value: unknown): TaskBookConfig | null {
  const result = readTaskBookSchema.safeParse(value);
  if (!result.success) return null;

  const taskTypes: TaskTypeConfig[] = result.data.taskTypes
    .filter((t): t is typeof t & { agentId: string } => t.agentId !== null)
    .map((t) => ({
      id: t.id,
      label: t.label,
      agentId: t.agentId,
      timeWithoutMinutes: t.timeWithoutMinutes,
      timeWithMinutes: t.timeWithMinutes,
    }));

  return {
    costPerUserPerYear: result.data.costPerUserPerYear,
    members: result.data.members,
    taskTypes,
  };
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
  agentId: string;
  timeWithoutMinutes: string;
  timeWithMinutes: string;
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
    })),
  };
}
