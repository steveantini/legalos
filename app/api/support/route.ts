import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { isCurrentUserPlatformOwner } from "@/lib/auth/access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { askSupportAssistant, SUPPORT_MODEL_ID } from "@/lib/support/assistant";
import { SUPPORT_ASSISTANT_PUBLIC } from "@/lib/support/config";
import {
  createSupportRateLimiter,
  SUPPORT_MAX_HISTORY_MESSAGES,
  SUPPORT_MESSAGE_MAX_CHARS,
} from "@/lib/support/rate-limit";

/**
 * The support assistant endpoint (D-160). Anonymous by design once public:
 * no account, no persistence, the conversation lives in the visitor's tab
 * and arrives whole on each call. While SUPPORT_ASSISTANT_PUBLIC is false,
 * only a signed-in platform owner gets past the gate (the preview), but the
 * abuse guardrails below are already in force so the public flip is the
 * config flag alone.
 *
 * Failure philosophy: the client renders every non-ok shape as a calm
 * fallback to documentation + contact. This route never leaks a raw
 * provider error, and the ledger write is best-effort (an accounting
 * failure must never cost a visitor their answer).
 */

const BodySchema = z.object({
  /** Client-minted, per-visit, anonymous. */
  sessionId: z.string().uuid(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        // Assistant turns echo our own prior answers; user turns are
        // re-checked against the tighter user cap below.
        content: z.string().min(1).max(4_000),
      }),
    )
    .min(1)
    .max(SUPPORT_MAX_HISTORY_MESSAGES + 1),
});

/** Per server instance — see lib/support/rate-limit.ts for the honest scope note. */
const limiter = createSupportRateLimiter();

export async function POST(request: NextRequest) {
  try {
    if (!SUPPORT_ASSISTANT_PUBLIC) {
      const isOwner = await isCurrentUserPlatformOwner();
      if (!isOwner) {
        // Mirrors the platform surface's 404-not-403: the preview's
        // existence is not advertised to anyone else.
        return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
      }
    }

    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
    }
    const { sessionId, messages } = parsed.data;

    const last = messages[messages.length - 1];
    if (last.role !== "user" || last.content.length > SUPPORT_MESSAGE_MAX_CHARS) {
      return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
    }

    // Rate key: first-hop client IP when present, else the session id. The
    // key lives only in this instance's memory; it is never logged/stored.
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const verdict = limiter.check(ip || sessionId);
    if (verdict !== "ok") {
      return NextResponse.json({ ok: false, error: verdict }, { status: 429 });
    }

    const result = await askSupportAssistant(messages);

    // Best-effort ledger write (support_usage_events, service-role only).
    // Tolerant of the table not existing yet (pre-migration) and of any
    // transient failure: log the code, keep the answer.
    try {
      const admin = createSupabaseAdminClient();
      const { error } = await admin.from("support_usage_events").insert({
        session_id: sessionId,
        model: SUPPORT_MODEL_ID,
        tokens_in: result.usage.tokensIn,
        tokens_out: result.usage.tokensOut,
        cache_creation_tokens: result.usage.cacheCreationTokens,
        cache_read_tokens: result.usage.cacheReadTokens,
        cost_micro_usd: result.usage.costMicroUsd,
      });
      if (error) {
        console.error("support usage ledger insert failed", { code: error.code });
      }
    } catch {
      console.error("support usage ledger unavailable");
    }

    return NextResponse.json({
      ok: true,
      answer: result.answer,
      citations: result.citations,
    });
  } catch {
    // Model hiccup, network, anything: one calm shape, no raw error.
    return NextResponse.json(
      { ok: false, error: "unavailable" },
      { status: 503 },
    );
  }
}
