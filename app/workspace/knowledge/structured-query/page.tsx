import type { Metadata } from "next";

import { StructuredQueryView } from "@/components/knowledge/structured-query-view";
import { HelpLink } from "@/components/workspace/help-link";
import { isCurrentUserSuperAdmin, requireAuthUser } from "@/lib/auth/access";
import { getEligibleSourceConnections } from "@/lib/knowledge/collections-data";
import { listSchemaSuggestions } from "@/lib/knowledge/schema-suggestions";
import {
  getStructuredQueryFolders,
  listStructuredQueries,
} from "@/lib/knowledge/structured-query";

export const metadata: Metadata = {
  title: "Structured Query",
};

/**
 * Knowledge → Structured Query (the user-facing launch of Structured Query). Ask
 * an exact question in plain language about the fields a document kind tracks; a
 * model translates it into a structured query, the pure deterministic engine
 * counts, and the answer comes back exact, with the interpreted query shown and
 * a supporting citation per matching document. This is the EXACT, repeatable
 * sibling of Research's read-and-reason: pick the folders to ask over, they
 * resolve to the document KIND they share (Step 3b), and you ask the kind.
 * Admins set up an unprepared kind in-flow (define fields or reuse one, then
 * prepare); members ask over kinds an admin has set up.
 *
 * One bounded model call per ask (the translation); this maxDuration keeps that
 * request comfortably inside the platform budget.
 */
export const maxDuration = 60;

export default async function StructuredQueryPage() {
  await requireAuthUser();

  const canSetUpFolders = await isCurrentUserSuperAdmin();
  const [folders, history, suggestions, connections] = await Promise.all([
    getStructuredQueryFolders(),
    listStructuredQueries(),
    listSchemaSuggestions(),
    canSetUpFolders ? getEligibleSourceConnections() : Promise.resolve([]),
  ]);

  return (
    <main className="flex flex-col gap-9">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="max-w-[22ch] text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
            Structured Query
          </h1>
          <p className="mt-[14px] max-w-[62ch] text-[14.5px] leading-[1.5] text-muted-foreground">
            Ask precise questions about your documents and get exact, checkable
            answers, not a summary, but a real result you can verify. Every
            answer shows how your question was read and a supporting quote from
            each document it drew on. It is deterministic: ask the same question
            twice and you get the exact same answer, every time, the precise and
            repeatable companion to Research&rsquo;s reasoning.
          </p>
        </div>
        <HelpLink topic="knowledge" className="mt-3" />
      </header>

      <StructuredQueryView
        folders={folders}
        canSetUpFolders={canSetUpFolders}
        connections={connections}
        history={history}
        suggestions={suggestions}
      />
    </main>
  );
}
