import type { Metadata } from "next";
import Link from "next/link";

import { CollapsibleSection } from "@/components/workspace/collapsible-section";
import { ComingSoonCard } from "@/components/workspace/coming-soon-card";
import { UseTemplateButton } from "@/components/workflows/use-template-button";
import { WatcherEnabledToggle } from "@/components/workflows/watcher-enabled-toggle";
import { buttonVariants } from "@/components/ui/button";
import { HelpLink } from "@/components/workspace/help-link";
import { getUserPreferenceAction } from "@/lib/actions/user-preferences";
import {
  getCurrentUserProfile,
  requireAuthUser,
  isCurrentUserOrgAdmin,
} from "@/lib/auth/access";
import {
  workflowsCollapsedSectionsKey,
  type CollapsedSectionsValue,
} from "@/lib/preferences/keys";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  workflowReadback,
  type ReadbackCapabilities,
} from "@/lib/workflows/builder-view";
import { formatRunTimestamp } from "@/lib/workflows/run-view";
import {
  cadenceLabelForSeconds,
  isWatcherTemplateSlug,
  windowDaysFromRunInput,
} from "@/lib/workflows/watchers-shared";
import type { WorkflowStep } from "@/lib/workflows/types";

export const metadata: Metadata = {
  title: "My Workflows",
};

type WorkflowRow = {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "archived";
  definition: { steps?: unknown[] } | null;
  updated_at: string;
};

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  template_slug: string | null;
  definition: { steps?: WorkflowStep[] } | null;
};

/** One adopted watcher: a schedule row plus the display fields the list shows. */
type WatcherScheduleRow = {
  id: string;
  enabled: boolean;
  cadence_seconds: number;
  run_input: unknown;
  last_run_at: string | null;
  owner_user_id: string;
  workflow_definition_id: string;
  created_at: string;
};

const STATUS_LABEL: Record<WorkflowRow["status"], string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
};

function StatusPill({ status }: { status: WorkflowRow["status"] }) {
  const dot =
    status === "active"
      ? "bg-emerald-500"
      : status === "draft"
        ? "bg-amber-500"
        : "bg-muted-foreground/40";
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function stepCount(definition: { steps?: unknown[] } | null): number {
  return Array.isArray(definition?.steps) ? definition.steps.length : 0;
}

function formatUpdated(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * One template card: name, description, the plain-language "what it does"
 * readback (the D3 idiom, identical to the builder's compose-time panel), and
 * the fork-only affordance. A template is a READ-ONLY starting point — "Use
 * this template" copies it into a user-owned draft; it is deliberately never
 * runnable or editable in place from this screen.
 *
 * WATCHER templates (Stage 3a, D-224) differ in one honest way: a quiet
 * "Runs on a schedule" pill marks them as scheduled rather than run-now, and
 * the affordance routes to the adopt flow (which creates the active watcher
 * AND its schedule together) instead of the fork button.
 */
function TemplateCard({
  template,
  readbackCaps,
  canAuthor,
}: {
  template: TemplateRow;
  readbackCaps: ReadbackCapabilities;
  canAuthor: boolean;
}) {
  const steps = Array.isArray(template.definition?.steps)
    ? template.definition.steps
    : [];
  const readback = workflowReadback(steps, readbackCaps);
  const isWatcher = isWatcherTemplateSlug(template.template_slug);
  return (
    <li className="rounded-[14px] border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[17px] font-medium leading-[1.2] tracking-[-0.012em] text-foreground">
          {template.name}
        </h3>
        {isWatcher ? (
          <span className="shrink-0 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Runs on a schedule
          </span>
        ) : null}
      </div>
      {template.description ? (
        <p className="mt-1.5 text-[13.5px] leading-[1.45] text-muted-foreground">
          {template.description}
        </p>
      ) : null}

      {readback.length > 0 ? (
        <div className="mt-4 rounded-lg border border-border bg-paper-2 px-4 py-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-caption">
            What it does
          </p>
          <ol className="mt-2 flex flex-col gap-1">
            {readback.map((phrase, i) => (
              <li
                key={steps[i].id}
                className="flex gap-2 text-[13px] leading-[1.55] text-foreground/90"
              >
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {i + 1}.
                </span>
                <span>{phrase}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-3">
        {isWatcher ? (
          canAuthor ? (
            <Link
              href={`/workspace/workflows/my-workflows/templates/${template.id}/adopt`}
              className={buttonVariants({ size: "sm" })}
            >
              Adopt this watcher
            </Link>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">
              An admin can adopt this watcher.
            </p>
          )
        ) : canAuthor ? (
          <UseTemplateButton templateId={template.id} templateName={template.name} />
        ) : (
          <p className="text-[12.5px] text-muted-foreground">
            An admin can start a workflow from this template.
          </p>
        )}
        <p className="text-[12px] text-muted-foreground">
          {steps.length === 1 ? "1 step" : `${steps.length} steps`}
        </p>
      </div>
    </li>
  );
}

/**
 * The Workflows screen: the user's workflows AND the template starting points,
 * merged into one adaptive surface (formerly two screens; the old Template
 * Library route redirects here).
 *
 *   - With workflows: the user's list LEADS (create / edit / run, unchanged),
 *     and the templates sit below in a collapsible "Start from a template"
 *     section (the launchpad sectioning idiom; collapse state persists
 *     per-user) so the starting points recede once no longer needed.
 *   - With NO workflows: the templates take primacy — the empty state IS the
 *     template gallery, leading a first-run user straight into a way to begin,
 *     alongside the blank New workflow affordance.
 *
 * Templates keep their fork-only distinction: "Use this template" copies one
 * into an editable, user-owned draft (forkWorkflowTemplate); a template is
 * never run or edited in place.
 */
export default async function MyWorkflowsPage() {
  await requireAuthUser();
  const [canAuthor, profile] = await Promise.all([
    isCurrentUserOrgAdmin(),
    getCurrentUserProfile(),
  ]);

  const supabase = await createSupabaseServerClient();
  const [workflowsRes, templatesRes, watchersRes, collapsedRes] =
    await Promise.all([
      supabase
        .from("workflow_definitions")
        .select("id, name, description, status, definition, updated_at")
        .neq("status", "template")
        .order("updated_at", { ascending: false }),
      supabase
        .from("workflow_definitions")
        .select("id, name, description, template_slug, definition")
        .eq("status", "template")
        .order("name", { ascending: true }),
      // Adopted watchers: the org's schedules (workflow_schedules_read is
      // org-scoped, so members see the list; only admins get the controls).
      supabase
        .from("workflow_schedules")
        .select(
          "id, enabled, cadence_seconds, run_input, last_run_at, owner_user_id, workflow_definition_id, created_at",
        )
        .order("created_at", { ascending: false }),
      getUserPreferenceAction<CollapsedSectionsValue>(workflowsCollapsedSectionsKey),
    ]);
  const workflows = (workflowsRes.data ?? []) as WorkflowRow[];
  const templates = (templatesRes.data ?? []) as TemplateRow[];
  const watchers = (watchersRes.data ?? []) as WatcherScheduleRow[];
  const templatesCollapsed =
    (collapsedRes.ok ? collapsedRes.value?.templates : undefined) ?? false;
  const watchersCollapsed =
    (collapsedRes.ok ? collapsedRes.value?.watchers : undefined) ?? false;

  // Agent names for the templates' plain-language readback (RLS-scoped).
  const agentIds = [
    ...new Set(
      templates.flatMap((t) =>
        (t.definition?.steps ?? [])
          .filter((s) => s.type === "agent")
          .map((s) => s.agentId),
      ),
    ),
  ];
  const { data: agentRows } =
    agentIds.length > 0
      ? await supabase.from("agents").select("id, name").in("id", agentIds)
      : { data: [] };
  const readbackCaps: ReadbackCapabilities = {
    agentNameById: new Map(
      ((agentRows ?? []) as Array<{ id: string; name: string }>).map((a) => [
        a.id,
        a.name,
      ]),
    ),
    // The watcher's native scan step is the one tool step a starter template
    // carries; anything else falls back to the chat-consistent tool label
    // derivation inside the readback.
    toolByKey: new Map(),
  };

  // Display fields for the watcher rows: the definition name (usually already
  // in the workflows list — adopted watchers are active definitions) and the
  // owner's name ("you" for the viewer; the users read policy may hide a
  // non-peer owner from a member, in which case the row omits the owner).
  const workflowNameById = new Map(workflows.map((w) => [w.id, w.name]));
  const missingNameIds = [
    ...new Set(
      watchers
        .map((w) => w.workflow_definition_id)
        .filter((id) => !workflowNameById.has(id)),
    ),
  ];
  const ownerIds = [
    ...new Set(
      watchers
        .map((w) => w.owner_user_id)
        .filter((id) => id !== profile?.id),
    ),
  ];
  const [missingNamesRes, ownersRes] = await Promise.all([
    missingNameIds.length > 0
      ? supabase
          .from("workflow_definitions")
          .select("id, name")
          .in("id", missingNameIds)
      : Promise.resolve({ data: [] }),
    ownerIds.length > 0
      ? supabase.from("users").select("id, full_name, email").in("id", ownerIds)
      : Promise.resolve({ data: [] }),
  ]);
  for (const row of (missingNamesRes.data ?? []) as Array<{
    id: string;
    name: string;
  }>) {
    workflowNameById.set(row.id, row.name);
  }
  const ownerNameById = new Map(
    (
      (ownersRes.data ?? []) as Array<{
        id: string;
        full_name: string | null;
        email: string;
      }>
    ).map((u) => [u.id, u.full_name?.trim() || u.email]),
  );

  const hasWorkflows = workflows.length > 0;

  return (
    <main className="flex w-full max-w-4xl flex-col gap-9">
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
            My workflows
          </h1>
          <p className="mt-[14px] max-w-[56ch] text-[14.5px] leading-[1.5] text-muted-foreground">
            Multi-step sequences your team can run: an agent, an action on a
            connected tool, or a pause for human approval, composed in order. Built
            from the agents and tools your organization already has.
          </p>
        </div>
        <div className="mt-2 flex shrink-0 items-center gap-4">
          <HelpLink topic="workflows" />
          {canAuthor ? (
            <Link
              href="/workspace/workflows/my-workflows/new"
              className={buttonVariants({ size: "sm" })}
            >
              New workflow
            </Link>
          ) : null}
        </div>
      </header>

      {hasWorkflows ? (
        <ul className="flex flex-col gap-3">
          {workflows.map((wf) => {
            const count = stepCount(wf.definition);
            const canRun = wf.status === "active";
            return (
              <li
                key={wf.id}
                className="rounded-[14px] border border-border bg-card p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-[17px] font-medium leading-[1.2] tracking-[-0.012em] text-foreground">
                    {wf.name}
                  </h2>
                  <StatusPill status={wf.status} />
                </div>
                {wf.description ? (
                  <p className="mt-1.5 line-clamp-2 text-[13.5px] leading-[1.45] text-muted-foreground">
                    {wf.description}
                  </p>
                ) : null}
                <p className="mt-3 text-[12px] text-muted-foreground">
                  {count === 1 ? "1 step" : `${count} steps`} · Updated{" "}
                  {formatUpdated(wf.updated_at)}
                </p>
                {canRun || canAuthor ? (
                  <div className="mt-4 flex items-center gap-2">
                    {canRun ? (
                      <Link
                        href={`/workspace/workflows/my-workflows/${wf.id}/run`}
                        aria-label={`Run ${wf.name}`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        Run
                      </Link>
                    ) : null}
                    {canAuthor ? (
                      <Link
                        href={`/workspace/workflows/my-workflows/${wf.id}/edit`}
                        aria-label={`Edit ${wf.name}`}
                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                      >
                        Edit
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : templates.length > 0 ? (
        // No workflows yet, but templates exist: lead with the empty-state
        // context. The templates themselves render in the always-present
        // "Start from a template" section below, so the header travels with
        // its cards whether or not the user has built anything.
        <div className="rounded-[14px] border border-dashed border-border bg-card/50 px-5 py-4">
          <h2 className="text-[14px] font-medium text-foreground">
            {canAuthor
              ? "You don’t have any workflows yet."
              : "Your organization doesn’t have any workflows yet."}
          </h2>
          <p className="mt-1 text-[13px] leading-[1.5] text-muted-foreground">
            {canAuthor
              ? "Start from a template below to copy it into a draft you fully own, ready to adapt, activate, and run. Or compose your own with New workflow."
              : "The ready-made templates below are waiting for an admin to start from."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-[14px] border border-dashed border-border bg-card/50 px-6 py-14 text-center">
          <p className="text-[15px] font-medium text-foreground">
            No workflows yet
          </p>
          <p className="max-w-[42ch] text-[13.5px] leading-[1.5] text-muted-foreground">
            {canAuthor
              ? "Compose your first multi-step workflow from the agents and tools your organization already has."
              : "Your organization hasn't created any workflows yet. Ask an admin to set one up."}
          </p>
          {canAuthor ? (
            <Link
              href="/workspace/workflows/my-workflows/new"
              className={`${buttonVariants({ size: "sm" })} mt-1`}
            >
              Create your first workflow
            </Link>
          ) : null}
        </div>
      )}

      {/* Your watchers (Stage 3a, D-224): the org's adopted watchers — each a
          workflow on a schedule — plus the two watcher kinds that are named
          but not built (the house ComingSoonCard convention). Always present:
          with zero watchers the empty line points at the gallery below, and
          the coming-soon pair honestly shows where this area is going. */}
      <CollapsibleSection
        title="Your watchers"
        sectionKey="watchers"
        preferenceKey={workflowsCollapsedSectionsKey}
        defaultCollapsed={watchersCollapsed}
        meta={
          watchers.length > 0 ? (
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {watchers.length}
            </span>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-3">
          {watchers.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {watchers.map((watcher) => {
                const name =
                  workflowNameById.get(watcher.workflow_definition_id) ??
                  "Watcher";
                const windowDays = windowDaysFromRunInput(watcher.run_input);
                const owner =
                  watcher.owner_user_id === profile?.id
                    ? "you"
                    : ownerNameById.get(watcher.owner_user_id);
                return (
                  <li
                    key={watcher.id}
                    className="rounded-[14px] border border-border bg-card p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <Link
                        href={`/workspace/workflows/my-workflows/${watcher.workflow_definition_id}/run`}
                        className="text-[17px] font-medium leading-[1.2] tracking-[-0.012em] text-foreground hover:underline hover:underline-offset-4"
                      >
                        {name}
                      </Link>
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                        <span
                          className={`size-1.5 rounded-full ${
                            watcher.enabled
                              ? "bg-emerald-500"
                              : "bg-muted-foreground/40"
                          }`}
                          aria-hidden="true"
                        />
                        {watcher.enabled ? "Active" : "Paused"}
                      </span>
                    </div>
                    <p className="mt-3 text-[12px] text-muted-foreground">
                      {cadenceLabelForSeconds(watcher.cadence_seconds)}
                      {windowDays != null ? <> · {windowDays}-day window</> : null}
                      {owner ? <> · Owned by {owner}</> : null}
                      {" · "}
                      {watcher.last_run_at
                        ? `Last ran ${formatRunTimestamp(watcher.last_run_at)}`
                        : "Hasn't run yet"}
                    </p>
                    {canAuthor ? (
                      <div className="mt-4">
                        <WatcherEnabledToggle
                          scheduleId={watcher.id}
                          enabled={watcher.enabled}
                          watcherName={name}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-[14px] border border-dashed border-border bg-card/50 px-5 py-4">
              <p className="text-[13px] leading-[1.5] text-muted-foreground">
                No watchers yet. Adopt the renewal watcher from the templates
                below and it will scan on its schedule from then on.
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ComingSoonCard
              title="Docket watcher"
              description="Will track new filings and status changes on the matters you follow, and record each as a finding."
            />
            <ComingSoonCard
              title="Regulatory monitor"
              description="Will watch the regulatory sources you choose and surface the changes relevant to your organization."
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* The templates live in one always-present collapsible section, so the
          "Start from a template" header (chevron, label, count) travels with
          its cards regardless of personal-workflow count: with workflows it
          recedes below the working list, with none it leads as the way to
          begin. Either way the header and its cards are one unit. */}
      {templates.length > 0 ? (
        <CollapsibleSection
          title="Start from a template"
          sectionKey="templates"
          preferenceKey={workflowsCollapsedSectionsKey}
          defaultCollapsed={templatesCollapsed}
          meta={
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {templates.length}
            </span>
          }
        >
          <ul className="flex flex-col gap-3">
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                readbackCaps={readbackCaps}
                canAuthor={canAuthor}
              />
            ))}
          </ul>
        </CollapsibleSection>
      ) : null}
    </main>
  );
}
