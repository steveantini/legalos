"use client";

import { useRef, useState } from "react";

import type { SupportCitation } from "@/lib/support/citations";
import { SUPPORT_MESSAGE_MAX_CHARS } from "@/lib/support/rate-limit";

/**
 * The support assistant's conversation surface (D-160): a calm, in-page
 * exchange in the marketing register, never a floating widget. The
 * assistant introduces itself honestly in one line, answers render as
 * plain text (sanitized by construction: text nodes only, no markdown,
 * no HTML), citations sit quietly under each answer as real guide links,
 * and every failure degrades to the same calm shape with the
 * documentation and the contact page as the path forward.
 *
 * Conversation state lives entirely in this component: multi-turn within
 * the visit (the full history rides on each request), nothing persisted,
 * no account. Closing the tab is the end of the conversation.
 */

type DisplayItem =
  | { kind: "user"; content: string }
  | { kind: "assistant"; content: string; citations: SupportCitation[] }
  | { kind: "fallback"; variant: "rate_limited" | "resting" | "unavailable" };

const MAX_HISTORY = 12;

type FallbackVariant = "rate_limited" | "resting" | "unavailable";

function FallbackBody({ variant }: { variant: FallbackVariant }) {
  if (variant === "rate_limited") {
    return (
      <p>
        You are sending messages faster than I can keep up. Give it a minute
        and try again.
      </p>
    );
  }
  if (variant === "resting") {
    return (
      <p>
        The assistant is resting for the day. The{" "}
        <QuietLink href="/documentation">documentation</QuietLink> covers
        every part of the product, and the{" "}
        <QuietLink href="/contact">contact page</QuietLink> reaches a person.
      </p>
    );
  }
  return (
    <p>
      I could not answer just now. Everything I know is in the{" "}
      <QuietLink href="/documentation">documentation</QuietLink>, and you can
      always <QuietLink href="/contact">tell us directly</QuietLink>.
    </p>
  );
}

function QuietLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="text-primary underline decoration-primary/30 underline-offset-[3px] transition-colors hover:decoration-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {children}
    </a>
  );
}

function TurnLabel({ children }: { children: string }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </p>
  );
}

export function SupportAssistant() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function send() {
    const question = input.trim();
    if (!question || pending) return;

    const nextItems: DisplayItem[] = [...items, { kind: "user", content: question }];
    setItems(nextItems);
    setInput("");
    setPending(true);

    // The API history is the real turns only; fallback notices never
    // re-enter the model's context.
    const history = nextItems
      .flatMap((item) =>
        item.kind === "user" || item.kind === "assistant"
          ? [{ role: item.kind, content: item.content }]
          : [],
      )
      .slice(-MAX_HISTORY);

    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, messages: history }),
      });
      const data = (await response.json()) as
        | { ok: true; answer: string; citations: SupportCitation[] }
        | { ok: false; error: string };

      if (data.ok) {
        setItems((prev) => [
          ...prev,
          { kind: "assistant", content: data.answer, citations: data.citations },
        ]);
      } else {
        const variant =
          data.error === "rate_limited" || data.error === "resting"
            ? data.error
            : "unavailable";
        setItems((prev) => [...prev, { kind: "fallback", variant }]);
      }
    } catch {
      setItems((prev) => [...prev, { kind: "fallback", variant: "unavailable" }]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-hairline">
      <div
        role="log"
        aria-live="polite"
        aria-label="Conversation with the support assistant"
        className="flex flex-col gap-5 px-5 py-5"
      >
        {/* The honest one-line self-introduction, always present. */}
        <div className="flex flex-col gap-1.5">
          <TurnLabel>legalOS</TurnLabel>
          <p className="text-[15px] leading-[1.7] text-ink-2">
            I answer questions about how legalOS works, from the
            documentation.
          </p>
        </div>

        {items.map((item, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <TurnLabel>{item.kind === "user" ? "You" : "legalOS"}</TurnLabel>
            {item.kind === "user" ? (
              <p className="whitespace-pre-wrap text-[15px] leading-[1.7] text-foreground">
                {item.content}
              </p>
            ) : item.kind === "assistant" ? (
              <div className="flex flex-col gap-2.5 text-[15px] leading-[1.7] text-ink-2">
                {item.content.split(/\n{2,}/).map((para, j) => (
                  <p key={j} className="whitespace-pre-wrap">
                    {para}
                  </p>
                ))}
                {item.citations.length > 0 ? (
                  <p className="text-[13px] leading-[1.6] text-muted-foreground">
                    From the documentation:{" "}
                    {item.citations.map((citation, j) => (
                      <span key={citation.slug}>
                        {j > 0 ? ", " : null}
                        <QuietLink href={citation.href}>
                          {citation.title}
                        </QuietLink>
                      </span>
                    ))}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="text-[15px] leading-[1.7] text-ink-2">
                <FallbackBody variant={item.variant} />
              </div>
            )}
          </div>
        ))}

        {pending ? (
          <div className="flex flex-col gap-1.5">
            <TurnLabel>legalOS</TurnLabel>
            <p
              aria-label="The assistant is writing"
              className="text-[15px] leading-[1.7] text-muted-foreground"
            >
              <span className="motion-safe:animate-pulse">Reading the documentation&hellip;</span>
            </p>
          </div>
        ) : null}
      </div>

      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        className="border-t border-hairline px-5 py-4"
      >
        <div className="flex items-end gap-3">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                formRef.current?.requestSubmit();
              }
            }}
            rows={1}
            maxLength={SUPPORT_MESSAGE_MAX_CHARS}
            placeholder="Ask how something in legalOS works"
            aria-label="Your question for the support assistant"
            className="min-h-[40px] w-full resize-none rounded-lg border border-hairline bg-transparent px-3.5 py-2 text-[15px] leading-[1.6] text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <button
            type="submit"
            disabled={pending || input.trim().length === 0}
            className="shrink-0 rounded-lg border border-hairline px-4 py-2 text-[14px] font-medium text-foreground transition-colors hover:bg-paper-2 disabled:opacity-45 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
          >
            Send
          </button>
        </div>
        <p className="mt-2.5 text-[12.5px] leading-[1.5] text-muted-foreground">
          Nothing here is saved past this visit. Prefer a person?{" "}
          <QuietLink href="/contact">Tell us directly</QuietLink>.
        </p>
      </form>
    </div>
  );
}
