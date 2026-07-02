import "server-only";

import { getCurrentUserProfile, isCurrentUserOrgAdmin } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { saveWorkflowDefinition } from "@/lib/workflows/authoring";
import {
  buildWatcherScheduleRow,
  isWatcherTemplateSlug,
  type AdoptWatcherInput,
} from "@/lib/workflows/watchers-shared";
import type { WorkflowStep } from "@/lib/workflows/types";

/**
 * Watcher adoption + controls (watcher arc Stage 3a, D-224).
 *
 * ADOPTION is the deliberate one-step path a watcher template takes instead of
 * the fork button: it creates an ACTIVE definition (through the same validated
 * authoring path as any workflow — saveWorkflowDefinition, whose classify now
 * recognises native actions) AND the workflow_schedules row that runs it, in
 * order, because a watcher without a schedule never fires and a schedule
 * pointing at a draft can't run. The adopter becomes the owner (option 2c):
 * every spawned run is attributed to them, so their existing owner-scoped RLS
 * admits pause/approve/resume with no policy change.
 *
 * Both mutations are org-admin gated in code AND re-enforced by the existing
 * RLS (workflow_definitions_admin_write, workflow_schedules_admin_write); this
 * module adds no policy and uses the user's RLS-scoped client throughout.
 */

export type AdoptWatcherResult =
  | { ok: true; scheduleId: string; definitionId: string }
  | { ok: false; error?: string; errors?: string[] };

export async function adoptRenewalWatcher(
  input: AdoptWatcherInput,
): Promise<AdoptWatcherResult> {
  if (!(await isCurrentUserOrgAdmin())) {
    return { ok: false, error: "You don't have permission to adopt watchers." };
  }
  const profile = await getCurrentUserProfile();
  if (!profile || !profile.organization_id) {
    return { ok: false, error: "unauthenticated" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: template, error: templateErr } = await supabase
    .from("workflow_definitions")
    .select("id, name, description, department_id, template_slug, definition")
    .eq("id", input.templateId)
    .eq("status", "template")
    .maybeSingle();
  if (templateErr) {
    console.error("watcher template fetch failed", { code: templateErr.code });
    return { ok: false, error: "The template couldn't be loaded. Try again." };
  }
  if (!template) return { ok: false, error: "This template no longer exists." };
  if (!isWatcherTemplateSlug(template.template_slug as string | null)) {
    return { ok: false, error: "This template isn't a watcher." };
  }

  const definition = template.definition as { steps?: WorkflowStep[] } | null;
  const saved = await saveWorkflowDefinition({
    id: null,
    name: template.name as string,
    description: (template.description as string | null) ?? "",
    departmentId: (template.department_id as string | null) ?? null,
    // Active immediately: a watcher is adopted to run, and the schedule below
    // points at it on the next tick. (The fork button's draft-then-edit path
    // is for workflows a person will shape before running.)
    status: "active",
    steps: Array.isArray(definition?.steps) ? definition.steps : [],
  });
  if (!saved.ok) return saved;

  const row = buildWatcherScheduleRow({
    organizationId: profile.organization_id,
    workflowDefinitionId: saved.id,
    adopterUserId: profile.id,
    input,
    nowIso: new Date().toISOString(),
  });
  const { data: schedule, error: scheduleErr } = await supabase
    .from("workflow_schedules")
    .insert(row)
    .select("id")
    .single();
  if (scheduleErr || !schedule) {
    console.error("workflow_schedules insert failed", { code: scheduleErr?.code });
    return { ok: false, error: "The watcher couldn't be scheduled. Try again." };
  }
  return {
    ok: true,
    scheduleId: schedule.id as string,
    definitionId: saved.id,
  };
}

export type SetWatcherEnabledResult = { ok: true } | { ok: false; error: string };

/**
 * Pause or resume a watcher (the enabled flag). Paused = the due-query never
 * selects it, so no tick claims it; resuming leaves next_run_at as it stands
 * (an already-due schedule runs on the next tick). Org-admin gated in code;
 * workflow_schedules_admin_write re-enforces at the database.
 */
export async function setWatcherEnabled(
  scheduleId: string,
  enabled: boolean,
): Promise<SetWatcherEnabledResult> {
  if (!(await isCurrentUserOrgAdmin())) {
    return { ok: false, error: "You don't have permission to change watchers." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("workflow_schedules")
    .update({ enabled })
    .eq("id", scheduleId)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("workflow_schedules enabled update failed", { code: error.code });
    return { ok: false, error: "The watcher couldn't be updated. Try again." };
  }
  if (!data) return { ok: false, error: "This watcher no longer exists." };
  return { ok: true };
}
