import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AgentForm } from "@/components/agents/agent-form";
import { updateAgentAction } from "@/lib/actions/agents";
import {
  getAgent,
  isCurrentUserOrgAdmin,
  requireAuthUser,
} from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ExistingAttachmentRow = {
  id: string;
  storage_path: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  extracted_text: string | null;
};

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Override the layout's default title (`<Agent.name>`) with `Edit
 * <Agent.name>`. Reuses the cached `getAgent(id)` so this is a no-op
 * fetch repeating the layout's resolved value.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const agent = await getAgent(id);
  return { title: agent ? `Edit ${agent.name}` : "Edit agent" };
}

export default async function EditAgentPage({ params }: PageProps) {
  const user = await requireAuthUser();
  const { id } = await params;
  const agent = await getAgent(id);
  // canManageTemplates only matters when the agent is a template;
  // fetched in parallel via the `cache()`-memoized helper from
  // Session 26.
  const canManageTemplates = agent?.is_template ? await isCurrentUserOrgAdmin() : false;

  // Two permitted paths (Session 27 widening of Session 8f-B's gate):
  //   - Owner of a user-owned non-template agent.
  //   - Org-admin (super_admin / org_admin) of a template.
  // Plus the universal sanity checks: native, non-deleted, prompt and
  // model present, department on the join. Single notFound() outcome
  // for any failure preserves the existence-leak guarantee from D-009.
  const isOwnerOfUserAgent =
    !!agent && agent.created_by === user.id && agent.is_template === false;
  const isAdminOfTemplate =
    !!agent && agent.is_template === true && canManageTemplates;
  if (
    !agent ||
    (!isOwnerOfUserAgent && !isAdminOfTemplate) ||
    agent.type !== "native" ||
    agent.deleted_at !== null ||
    !agent.system_prompt ||
    !agent.model ||
    !agent.department
  ) {
    notFound();
  }

  // Attachments live in a sibling table; `getAgent` doesn't fetch them.
  // Filtering on `deleted_at IS NULL` skips removed attachments;
  // ordering by `created_at ASC` matches the deterministic ordering
  // used in the chat route's system-block construction.
  const supabase = await createSupabaseServerClient();
  const { data: attachmentRows } = await supabase
    .from("agent_attachments")
    .select(
      "id, storage_path, original_filename, content_type, size_bytes, extracted_text",
    )
    .eq("agent_id", agent.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const existingAttachments = (attachmentRows ?? []).map(
    (row: ExistingAttachmentRow) => ({
      attachmentId: row.id,
      storagePath: row.storage_path,
      originalFilename: row.original_filename,
      contentType: row.content_type,
      sizeBytes: row.size_bytes,
      extractedText: row.extracted_text,
      extractionWarning:
        row.extracted_text === null
          ? "Couldn't extract text from this file."
          : null,
    }),
  );

  return (
    <main className="mx-auto max-w-3xl">
      <header className="mb-8">
        <p className="text-sm text-muted-foreground">{agent.department.name}</p>
        <h1 className="mt-1 text-3xl font-semibold">Edit agent</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Changes apply to new conversations. Existing conversations keep their
          original prompt and model snapshot.
        </p>
      </header>

      {agent.is_template ? (
        <div
          role="note"
          className="mb-6 rounded-md border border-warn-fg/30 bg-warn-bg px-4 py-3 text-[13px] leading-[1.55] text-warn-fg-deep"
        >
          <p className="font-medium text-warn-fg">Template</p>
          <p className="mt-1">
            Edits to this agent affect everyone in your organization. Existing
            conversations keep their original system prompt; new conversations
            will use your edits.
          </p>
        </div>
      ) : null}

      <AgentForm
        mode="edit"
        agentId={agent.id}
        existingAttachments={existingAttachments}
        defaults={{
          name: agent.name,
          description: agent.description ?? "",
          systemPrompt: agent.system_prompt,
          model: agent.model,
          toolsEnabled: Array.isArray(agent.tools_enabled)
            ? (agent.tools_enabled as unknown as string[])
            : [],
        }}
        departmentSlug={agent.department.slug}
        forkedFromAgent={null}
        action={updateAgentAction}
      />
    </main>
  );
}
