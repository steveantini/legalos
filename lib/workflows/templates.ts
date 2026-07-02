import {
  NATIVE_ACTIONS_SERVER_ID,
  RENEWAL_SCAN_ACTION,
  isNativeAction,
} from "@/lib/workflows/native-actions-shared";
import type { ValueSource, WorkflowStep } from "@/lib/workflows/types";

/**
 * Starter workflow templates (Workflows arc Step 5).
 *
 * A template SPEC is the portable shape: steps reference agents by their
 * stable SLUG (the same key the C4L import upserts on), never by UUID.
 * `resolveTemplateSteps` turns a spec into a concrete org-specific definition
 * by resolving each slug to the org's real agent id at seed time — and that
 * resolution seam is deliberately the whole of the org-specificity, so a
 * future portable "recipe" model (cross-org, capability-based) is additive:
 * a recipe is a spec plus per-org resolution, which is what this already does
 * for one org.
 *
 * The specs are LINEAR and AGENT-CENTRIC (the D3 model): each agent step
 * carries a plain-language instruction layered on the agent's own expertise.
 * The flagship "Review a contract (any type)" template handles routing INSIDE
 * the agent's reasoning — the instruction tells it to identify the contract
 * type and review accordingly — so no branching execution is needed (the
 * deliberate Step 5 decision; branching remains a deferred engine capability).
 *
 * Step ids are deterministic strings (stable across re-seeds, unique within
 * each definition — all the validator requires), so re-running the seed never
 * churns ids.
 *
 * Pure data + a pure resolver — no I/O — so the seed's resolution logic is
 * unit-testable, and the specs themselves are testable against the real
 * definition validator.
 */

export type TemplateStepSpec =
  | {
      id: string;
      type: "agent";
      name: string;
      /** The agent's stable slug (agents.slug), resolved to its id per org. */
      agentSlug: string;
      /** The D3 plain-language instruction for this step. */
      instruction: string;
    }
  | {
      id: string;
      type: "human_checkpoint";
      name: string;
      prompt: string;
    }
  | {
      id: string;
      type: "tool_action";
      name: string;
      /** MCP server id, or the reserved native serverId for an internal action. */
      serverId: string;
      toolName: string;
      /** argName → value source (e.g. the watcher's config from the run input). */
      argMapping?: Record<string, ValueSource>;
    };

export type WorkflowTemplateSpec = {
  /** Stable per-org seed key (workflow_definitions.template_slug). */
  slug: string;
  name: string;
  description: string;
  steps: TemplateStepSpec[];
};

/**
 * The renewal watcher (watcher arc; built dark in Stage 2, D-221; admitted to
 * the gallery in Stage 3a, D-224). Referenced by the starter array below, so
 * the template seed materializes it as a gallery row per org, and kept as its
 * own named export because two other consumers use the spec directly: the
 * adopt flow (which creates an ACTIVE definition plus its workflow_schedules
 * row in one deliberate step — a watcher without a schedule never fires) and
 * the Stage-2 fixture seed. On the gallery card it is NOT forked with "Use
 * this template"; the card routes to the adopt flow instead.
 *
 * A single native-action step: the deterministic renewal scan + finding write,
 * executed inline by the engine (dispatched through runToolActionStep before the
 * MCP lookup). Its config rides the run input (mapped onto the `config` arg): the
 * schedule provides { collectionId, windowDays, findingKind } and the cron
 * injects scheduleId at run time.
 */
export const RENEWAL_WATCHER_TEMPLATE: WorkflowTemplateSpec = {
  slug: "renewal-watcher",
  name: "Renewal watcher",
  description:
    "Scans a collection of agreements for expirations coming up within the window and records one finding per agreement that is due, so nothing renews or lapses unnoticed. Runs on a schedule you set when you adopt it.",
  steps: [
    {
      id: "scan-renewals",
      type: "tool_action",
      name: "Scan for upcoming renewals",
      serverId: NATIVE_ACTIONS_SERVER_ID,
      toolName: RENEWAL_SCAN_ACTION,
      argMapping: { config: { source: "run_input" } },
    },
  ],
};

/**
 * The seeded starters. Quality over quantity: each doubles as a guided
 * example of composing agent-centric workflows. Agent picks (resolved live
 * against the org at seed time; a template whose agent is missing is skipped
 * by the seed, never seeded broken):
 *   - c4l-commercial-legal-nda-review — the C4L inbound-NDA triage leaf.
 *   - enterprise-agreement-review — the most general ACTIVE reviewer (the C4L
 *     `review` router was deliberately filtered out as not agent-shaped, so
 *     the org has no single general-purpose review agent; the instruction
 *     carries the classify-and-review direction instead).
 *   - c4l-commercial-legal-stakeholder-summary — the C4L summarize-for-people
 *     leaf, instructed per use to draft (and, with approval, send) the email.
 * The renewal watcher (above) closes the array: no agents, one native action,
 * adopted rather than forked (Stage 3a, D-224).
 */
export const STARTER_WORKFLOW_TEMPLATES: WorkflowTemplateSpec[] = [
  {
    slug: "review-inbound-nda",
    name: "Review an inbound NDA",
    description:
      "Paste an inbound NDA. The NDA review agent flags unusual or unfavorable terms with suggested redlines, then the run pauses for your review.",
    steps: [
      {
        id: "review-nda",
        type: "agent",
        name: "Review the NDA",
        agentSlug: "c4l-commercial-legal-nda-review",
        instruction:
          "Review this NDA and flag unusual or unfavorable terms, with suggested redlines.",
      },
      {
        id: "review-findings",
        type: "human_checkpoint",
        name: "Review the findings",
        prompt:
          "Review the agent’s findings and suggested redlines before relying on them.",
      },
    ],
  },
  {
    slug: "review-any-contract",
    name: "Review a contract (any type)",
    description:
      "Paste any contract. The agent identifies what it is (NDA, MSA, SOW, vendor agreement, or other) and reviews it accordingly, flagging the key risks and suggested changes.",
    steps: [
      {
        id: "classify-and-review",
        type: "agent",
        name: "Identify and review the contract",
        agentSlug: "enterprise-agreement-review",
        instruction:
          "Identify what kind of contract this is (NDA, MSA, SOW, vendor agreement, or other), then review it accordingly: flag the key risks, any unusual or unfavorable terms, and the changes you would request.",
      },
      {
        id: "review-findings",
        type: "human_checkpoint",
        name: "Review the findings",
        prompt:
          "Review the agent’s classification and findings before relying on them.",
      },
    ],
  },
  {
    slug: "review-and-respond",
    name: "Review and respond",
    description:
      "Review an inbound agreement, approve the findings, then an agent drafts a brief cover email summarizing the requested changes and, only with your approval, sends it.",
    steps: [
      {
        id: "review-agreement",
        type: "agent",
        name: "Review the agreement",
        agentSlug: "enterprise-agreement-review",
        instruction:
          "Review this agreement and summarize the key findings, the risks, and the changes we would request, in a form a colleague can act on.",
      },
      {
        id: "approve-findings",
        type: "human_checkpoint",
        name: "Approve the findings",
        prompt: "Review the findings before a response is drafted from them.",
      },
      {
        id: "draft-and-send",
        type: "agent",
        name: "Draft and send the cover email",
        agentSlug: "c4l-commercial-legal-stakeholder-summary",
        instruction:
          "Draft a brief, professional cover email to the counterparty summarizing the key review points and the changes requested. If email is connected and the counterparty’s address is clear from the context, send it; otherwise, present the draft.",
      },
    ],
  },
  RENEWAL_WATCHER_TEMPLATE,
];

export type ResolvedTemplateSteps =
  | { ok: true; steps: WorkflowStep[] }
  | { ok: false; missingAgentSlugs: string[] };

/**
 * Resolve a template spec's agent slugs to the org's real agent ids,
 * producing the concrete canonical steps a workflow_definitions row stores.
 * Every referenced slug must resolve — a template is seeded whole or not at
 * all (the seed reports and skips on a miss; it never seeds a broken
 * template). Checkpoint steps pass through unchanged. Agent steps rely on the
 * default `previous` input mapping (the first step receives the run input;
 * after a checkpoint, `previous` is the value the checkpoint passed through).
 */
export function resolveTemplateSteps(
  spec: WorkflowTemplateSpec,
  agentIdBySlug: Map<string, string>,
): ResolvedTemplateSteps {
  const missing = [
    ...new Set(
      spec.steps
        .filter((s) => s.type === "agent")
        .map((s) => s.agentSlug)
        .filter((slug) => !agentIdBySlug.has(slug)),
    ),
  ];
  if (missing.length > 0) return { ok: false, missingAgentSlugs: missing };

  return {
    ok: true,
    steps: spec.steps.map((s): WorkflowStep => {
      if (s.type === "agent") {
        return {
          id: s.id,
          type: "agent",
          name: s.name,
          agentId: agentIdBySlug.get(s.agentSlug) as string,
          instruction: s.instruction,
        };
      }
      if (s.type === "tool_action") {
        // No slug resolution — a tool_action references a server + tool directly
        // (an MCP target, or the reserved native serverId for an internal action).
        return {
          id: s.id,
          type: "tool_action",
          name: s.name,
          serverId: s.serverId,
          toolName: s.toolName,
          ...(s.argMapping ? { argMapping: s.argMapping } : {}),
        };
      }
      return { id: s.id, type: "human_checkpoint", name: s.name, prompt: s.prompt };
    }),
  };
}

/**
 * The tool classification the TEMPLATE SEED validates with (the same gate the
 * engine applies at run start, run.ts): a native action is a known, governed
 * tool_action target and classifies "read"; anything else is unknown here —
 * starter templates carry no MCP tool steps, and an MCP-referencing spec should
 * fail the seed's validation rather than seed a template the org may not be
 * able to run. Exported so the seed script and its test share one definition.
 */
export async function classifyStarterTemplateTool(
  serverId: string,
  toolName: string,
): Promise<"read" | null> {
  return isNativeAction(serverId, toolName) ? "read" : null;
}
