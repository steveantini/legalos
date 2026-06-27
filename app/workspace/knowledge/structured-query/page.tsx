import type { Metadata } from "next";

import { StructuredQueryView } from "@/components/knowledge/structured-query-view";
import { HelpLink } from "@/components/workspace/help-link";
import { isCurrentUserSuperAdmin, requireAuthUser } from "@/lib/auth/access";
import { listSchemaSuggestions } from "@/lib/knowledge/schema-suggestions";
import {
  getStructuredQuerySetup,
  listStructuredQueries,
} from "@/lib/knowledge/structured-query";

export const metadata: Metadata = {
  title: "Structured Query",
};

/**
 * Knowledge → Structured Query (the user-facing launch of Structured Query). Ask
 * an exact question in plain language about the fields a collection tracks; a
 * model translates it into a structured query, the pure deterministic engine
 * counts, and the answer comes back exact, with the interpreted query shown and
 * a supporting citation per matching document. This is the EXACT, repeatable
 * sibling of Research's read-and-reason: you define the fields and prepare the
 * collection (in Collections), then ask precise questions here.
 *
 * One bounded model call per ask (the translation); this maxDuration keeps that
 * request comfortably inside the platform budget.
 */
export const maxDuration = 60;

export default async function StructuredQueryPage() {
  await requireAuthUser();

  const [setup, history, suggestions, canDefineSchemas] = await Promise.all([
    getStructuredQuerySetup(),
    listStructuredQueries(),
    listSchemaSuggestions(),
    isCurrentUserSuperAdmin(),
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
        collections={setup.queryable}
        schemalessCollections={setup.schemaless}
        canDefineSchemas={canDefineSchemas}
        history={history}
        suggestions={suggestions}
      />
    </main>
  );
}
