import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AgentForm } from "@/components/agents/agent-form";
import { updateAgentAction } from "@/lib/actions/agents";
import { getAgent, requireAuthUser } from "@/lib/auth/access";
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

  // Single notFound() outcome for any failure path so we never leak which
  // condition tripped: missing agent (caught by the layout already, but
  // defensive here too), RLS-hidden, owned by someone else, template,
  // external, soft-deleted (deleted agents are restored from
  // `/agents/trash`, not edited directly), missing prompt or model
  // (which would mean the agent's a malformed native row), or no
  // department on the join (defensive — `getAgent` uses inner join, so
  // department is always present for visible agents).
  if (
    !agent ||
    agent.created_by !== user.id ||
    agent.is_template === true ||
    agent.type !== "native" ||
    agent.deleted_at !== null ||
    !agent.system_prompt ||
    !agent.model ||
    !agent.department
  ) {
    notFound();
  }

  // Attachments live in a sibling table; `getAgent` doesn't fetch them
  // (correct — the helper is per-row on `agents`). One inline query
  // here. If a second consumer of attachments emerges, extract a
  // `getAgentAttachments(id)` helper at that point. Filtering on
  // `deleted_at IS NULL` skips removed attachments; ordering by
  // `created_at ASC` matches the deterministic ordering used in the
  // chat route's system-block construction so a user sees the same
  // order both places.
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
