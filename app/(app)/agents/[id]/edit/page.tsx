import { notFound } from "next/navigation";

import { AgentForm } from "@/components/agents/agent-form";
import { updateAgentAction } from "@/lib/actions/agents";
import { requireAuthUser } from "@/lib/auth/access";
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

export default async function EditAgentPage({ params }: PageProps) {
  const user = await requireAuthUser();
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: agent } = await supabase
    .from("agents")
    .select(
      "id, name, description, type, is_template, system_prompt, model, created_by, deleted_at, departments(slug, name)",
    )
    .eq("id", id)
    .maybeSingle();

  // Single notFound() outcome for any failure path so we never leak which
  // condition tripped: missing agent, RLS-hidden, owned by someone else,
  // template, external, or already soft-deleted (deleted agents are edited
  // through restore from /agents/trash, not directly).
  if (
    !agent ||
    agent.created_by !== user.id ||
    agent.is_template === true ||
    agent.type !== "native" ||
    agent.deleted_at !== null ||
    !agent.system_prompt ||
    !agent.model
  ) {
    notFound();
  }

  const department = agent.departments as unknown as {
    slug: string;
    name: string;
  } | null;
  if (!department) {
    notFound();
  }

  // Load active attachments for the form's existing-list. Filtering on
  // deleted_at IS NULL skips removed attachments; ordering by created_at
  // ASC matches the deterministic ordering used in the chat route's
  // system-block construction so a user sees the same order both
  // places.
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
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <p className="text-sm text-muted-foreground">{department.name}</p>
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
        }}
        departmentSlug={department.slug}
        forkedFromAgent={null}
        action={updateAgentAction}
      />
    </main>
  );
}
