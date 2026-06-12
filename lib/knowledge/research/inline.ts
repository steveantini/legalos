import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import { getOrganizationDefaultModel } from "@/lib/auth/access";
import type { ChatSource } from "@/lib/chat/sse-parser";
import {
  listRemoteFolderChildren,
  readRemoteDocument,
  type EnumerationTarget,
} from "@/lib/knowledge/enumeration";
import { getVisibleCollections } from "@/lib/knowledge/collections-data";
import { buildCitations, composeBasisLine } from "@/lib/knowledge/research/basis";
import {
  buildClassifySystemPrompt,
  buildClassifyUserPrompt,
  parseClassifierOutput,
  type ClassifyDocument,
} from "@/lib/knowledge/research/classify";
import { processResearchSegment } from "@/lib/knowledge/research/engine-core";
import {
  composeInlineFindingsResult,
  composeNoCollectionsResult,
  composeOverCapResult,
  composeScopeUnreadableResult,
  composeUnknownCollectionsResult,
  resolveRequestedCollections,
  RESEARCH_INLINE_DOCUMENT_CAP,
} from "@/lib/knowledge/research/inline-result";
import {
  isReadableMimeType,
  type ResearchDocumentRef,
} from "@/lib/knowledge/research/shared";
import { resolveEnumerationTarget } from "@/lib/knowledge/targets";
import { runSyncSegment, type SyncSource } from "@/lib/knowledge/sync";
import {
  streamAnthropicChat,
  type AnthropicCustomTool,
} from "@/lib/llm/anthropic/chat";
import { resolveModelCredential } from "@/lib/llm/model-credential";
import { DEFAULT_MODEL_FALLBACK } from "@/lib/llm/models";
import { parseModelId } from "@/lib/llm/parse-model-id";

/**
 * Research as a NATIVE chat tool (Knowledge arc Step 3): a server-executed
 * sibling of the MCP tools in the existing loop, never routed to any MCP
 * server. The inline shape is the research engine COMPRESSED for one chat
 * request: enumerate live, read with the research budget, classify in
 * batches — and STOP. No planning call (a compact built-in rubric derives
 * from the question) and no synthesis call (the agent IS the synthesizer:
 * the tool result carries per-document determinations + the basis, and the
 * model writes the answer in its own turn). That keeps a capped call well
 * inside the loop's wall clock.
 *
 * PERMISSIONS — the critical property: scope resolves through
 * getVisibleCollections(), THE SAME RLS-scoped read the Research surface
 * uses. The user's identity flows ambiently: the chat request's
 * cookie-scoped Supabase client is what that function reads with, so the
 * agent can never research a collection its human couldn't select. There is
 * no parallel permission path.
 *
 * Anything short of an answer — no collections, unknown names, over the
 * inline cap (15 documents), unreadable connections — returns an HONEST
 * tool result written to relay well, pointing corpus-scale questions at the
 * Research surface. The cap exists because segmenting is not available
 * inline; the surface is where big scopes belong.
 *
 * LEDGER: the classification calls' usage is RETURNED to the loop, which
 * folds it into the chat turn's single usage_events row — inline research is
 * chat work, attributed to the conversation and agent like every other
 * round. No research_runs row is created.
 */

export const RESEARCH_TOOL_NAME = "research_collections";

export type InlineResearchOutcome = {
  /** The tool_result text the model receives. */
  resultText: string;
  /** Citations to attach to the conversation (the sources idiom). */
  citations: ChatSource[];
  /** Usage to fold into the chat turn's summed ledger row. */
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    web_search_requests: number;
  };
  /** True when the call answered (vs an honest non-answer result). */
  answered: boolean;
};

const ZERO_USAGE = {
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  web_search_requests: 0,
};

/** Listing calls allowed for inline enumeration (~10 pages ≈ 1,000 entries —
 * far beyond the cap, so hitting this budget itself means "too big"). */
const INLINE_ENUMERATION_CALLS = 10;
const CLASSIFY_MAX_TOKENS = 4_000;

/**
 * The tool definition the chat loop offers. The description teaches WHEN to
 * reach for it (questions about the org's own documents) and its LIMITS
 * (small scopes inline; corpora belong on the Research page), and names the
 * user's visible collections so the model scopes with real names.
 */
export function buildResearchToolDef(
  visibleCollections: { name: string; documentCount: number }[],
): AnthropicCustomTool {
  const collectionsLine =
    visibleCollections.length > 0
      ? `Collections visible to this user: ${visibleCollections
          .map((c) => `"${c.name}" (~${c.documentCount} documents)`)
          .join(", ")}.`
      : "No collections are currently visible to this user.";
  return {
    name: RESEARCH_TOOL_NAME,
    description: [
      "Research the organization's own document collections: reads each document in scope where it lives and returns per-document determinations with citations.",
      "Use it for questions about the organization's own contracts, policies, or files (\"do our MSAs include X\", \"which vendor agreements say Y\").",
      `Inline limit: ${RESEARCH_INLINE_DOCUMENT_CAP} documents per call. Larger scopes return a handoff to the Research page, which handles corpus-scale questions; relay that to the user.`,
      collectionsLine,
    ].join(" "),
    input_schema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The question to answer from the documents.",
        },
        collections: {
          type: "array",
          items: { type: "string" },
          description:
            "Collection names to scope to (from the visible list). Omit to use all visible collections.",
        },
      },
      required: ["question"],
    },
  };
}

/** The compact inline rubric: the question is the rubric (no planning call). */
function inlineRubric(question: string): string {
  return [
    `The question under review: ${question}`,
    "A document is RELEVANT if it contains material that bears on this question. For a relevant document, state specifically what it says about the question, quoting the operative language where possible. For an irrelevant document, say in one line why it does not bear on the question.",
  ].join("\n");
}

/**
 * Execute one inline research call. NEVER throws — every failure mode is an
 * honest tool result the model can relay.
 */
export async function executeInlineResearch(params: {
  organizationId: string;
  userId: string;
  question: string;
  collections?: string[];
}): Promise<InlineResearchOutcome> {
  const { organizationId, userId } = params;
  const question = params.question.trim().slice(0, 600);
  try {
    // THE permission boundary: the same RLS-scoped read the surface uses,
    // under the asking user's ambient session.
    const visible = await getVisibleCollections();
    if (visible.length === 0) {
      return {
        resultText: composeNoCollectionsResult(),
        citations: [],
        usage: ZERO_USAGE,
        answered: false,
      };
    }

    const { matched, unknown } = resolveRequestedCollections(
      params.collections,
      visible,
    );
    if (unknown.length > 0 || matched.length === 0) {
      return {
        resultText: composeUnknownCollectionsResult(
          unknown,
          visible.map((c) => c.name),
        ),
        citations: [],
        usage: ZERO_USAGE,
        answered: false,
      };
    }

    // Resolve live targets for every usable source; an unusable scope is an
    // honest non-answer, never a partial silent sweep.
    const sources = matched.flatMap((collection) =>
      collection.sources.map((source) => ({ collection, source })),
    );
    if (sources.length === 0) {
      return {
        resultText: composeScopeUnreadableResult(),
        citations: [],
        usage: ZERO_USAGE,
        answered: false,
      };
    }
    const targets = new Map<string, EnumerationTarget>();
    for (const { source } of sources) {
      if (targets.has(source.connectionId)) continue;
      const target = await resolveEnumerationTarget(source.connectionId);
      if (!target) {
        return {
          resultText: composeScopeUnreadableResult(),
          citations: [],
          usage: ZERO_USAGE,
          answered: false,
        };
      }
      targets.set(source.connectionId, target);
    }

    // Live enumeration via the Step-1 walk with collecting deps (the same
    // reuse the engine's planning phase makes).
    const collected: ResearchDocumentRef[] = [];
    const syncSources: SyncSource[] = sources.map(({ source }, index) => ({
      id: String(index),
      rootReference: source.rootReference,
      recursive: source.recursive,
    }));
    const bySyncId = new Map(
      sources.map((entry, index) => [String(index), entry]),
    );
    const enumeration = await runSyncSegment(
      syncSources,
      null,
      {
        listChildren: (source, folderId, pageToken) =>
          listRemoteFolderChildren(
            targets.get(bySyncId.get(source.id)!.source.connectionId)!,
            folderId,
            pageToken,
          ),
        upsertDocuments: async (source, entries) => {
          const { collection, source: collectionSource } = bySyncId.get(
            source.id,
          )!;
          for (const entry of entries) {
            collected.push({
              externalId: entry.id,
              title: entry.name,
              mimeType: entry.mimeType ?? "",
              sourceUrl: entry.url,
              connectionId: collectionSource.connectionId,
              serverId: targets.get(collectionSource.connectionId)!.serverId,
              provenance: `${collection.name} · ${collectionSource.displayPath}`,
            });
          }
        },
        finalizeSource: async () => {},
        nowIso: () => new Date().toISOString(),
      },
      INLINE_ENUMERATION_CALLS,
    );

    const seen = new Set<string>();
    const readable = collected.filter((doc) => {
      if (seen.has(doc.externalId)) return false;
      seen.add(doc.externalId);
      return isReadableMimeType(doc.mimeType);
    });
    const collectionNames = matched.map((c) => c.name);

    // Over the inline cap (or too big to even enumerate inline): the honest
    // handoff to the Research surface.
    if (!enumeration.completed || readable.length > RESEARCH_INLINE_DOCUMENT_CAP) {
      const count = enumeration.completed
        ? readable.length
        : Math.max(
            readable.length,
            matched.reduce((sum, c) => sum + c.presentCount, 0),
          );
      return {
        resultText: composeOverCapResult(count, collectionNames),
        citations: [],
        usage: ZERO_USAGE,
        answered: false,
      };
    }
    if (readable.length === 0) {
      return {
        resultText:
          "The selected collections contain no readable documents. Suggest syncing the collections under Knowledge, or picking a different scope.",
        citations: [],
        usage: ZERO_USAGE,
        answered: false,
      };
    }

    // Model context for the classification calls (no ledger writes here —
    // usage returns to the loop and lands in the chat turn's row).
    const modelId = (await getOrganizationDefaultModel()) ?? DEFAULT_MODEL_FALLBACK;
    const { vendor, model: bareModel } = parseModelId(modelId);
    const credential = await resolveModelCredential({
      organizationId,
      userId,
      vendor,
    });
    const usage = { ...ZERO_USAGE };

    const classify = async (batch: ClassifyDocument[]) => {
      const r = streamAnthropicChat({
        model: bareModel,
        credential,
        systemBlocks: [
          { type: "text", text: buildClassifySystemPrompt(inlineRubric(question)) },
        ],
        messages: [{ role: "user", content: buildClassifyUserPrompt(batch) }],
        maxTokens: CLASSIFY_MAX_TOKENS,
      });
      const final = await r.finalMessage();
      const u = await r.finalUsage();
      usage.input_tokens += u.input_tokens;
      usage.output_tokens += u.output_tokens;
      usage.cache_creation_input_tokens += u.cache_creation_input_tokens;
      usage.cache_read_input_tokens += u.cache_read_input_tokens;
      const text = (final.content as Anthropic.Messages.ContentBlock[])
        .filter(
          (block): block is Anthropic.Messages.TextBlock =>
            block.type === "text",
        )
        .map((block) => block.text)
        .join("");
      return parseClassifierOutput(
        text,
        batch.map((doc) => doc.externalId),
      );
    };

    const findings = await processResearchSegment(readable, {
      readDocument: (doc) =>
        readRemoteDocument(targets.get(doc.connectionId)!, doc.externalId),
      classify,
    });

    const fetchFailed = findings.filter((f) => f.status === "fetch_failed").length;
    const readIncomplete = findings.filter(
      (f) => f.status === "read_incomplete",
    ).length;
    const basis = composeBasisLine({
      documentsRead: findings.length - fetchFailed,
      fetchFailed,
      readIncomplete,
      // Deduped entries minus the readable set = unsupported types skipped.
      skippedUnsupported: seen.size - readable.length,
      collectionNames,
    });
    const citations: ChatSource[] = buildCitations(findings).map((c) => ({
      id: `src_research_${c.id}`,
      title: c.title,
      url: c.url,
      domain: c.domain,
    }));

    return {
      resultText: composeInlineFindingsResult(question, findings, basis),
      citations,
      usage,
      answered: true,
    };
  } catch (err) {
    console.error("inline research failed", err);
    return {
      resultText:
        "The research call hit a problem and stopped. Nothing was changed; the user can try again, or use the Research page under Knowledge.",
      citations: [],
      usage: ZERO_USAGE,
      answered: false,
    };
  }
}
