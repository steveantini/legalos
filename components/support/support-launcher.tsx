"use client";

import { MessageCircleIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { SupportCitation } from "@/lib/support/citations";
import { SUPPORT_MESSAGE_MAX_CHARS } from "@/lib/support/rate-limit";

/**
 * The support assistant's floating launcher (D-161): a small dialogue
 * icon in the bottom-right corner of every public marketing page, opening
 * a chat panel anchored above it.
 *
 * DESIGN RULE — SILENT BY DESIGN. This launcher never auto-opens, never
 * animates for attention, never badges, never greets unprompted. It sits
 * quietly until clicked. This is the explicit anti-annoyance line: the
 * web is full of chat widgets that bounce, pulse, and pop open mid-read,
 * and legalOS's register is the opposite of that. Future hands: do not
 * add entrance animations, attention pulses, unread dots, proactive
 * messages, or auto-open timers here. If a future need seems to demand
 * attention-seeking, the answer is no.
 *
 * Mounted ONLY in the (marketing) layout — the workspace deliberately has
 * no launcher (a chat bubble inside a chat product invites confusion with
 * agents; the per-surface Help links serve in-product needs), and that
 * exclusion is structural: this component simply does not exist in the
 * /workspace tree.
 *
 * Gate: the component first probes GET /api/support (204 = render, 404 =
 * stay invisible). While the assistant is in owner-only preview, only the
 * signed-in platform owner gets the 204; anonymous visitors mount nothing.
 * Because the probe is client-side, marketing pages stay static and the
 * landing's entrance choreography is untouched — the launcher appears
 * (without animation) whenever the probe resolves, outside the staged
 * sequence.
 *
 * Conversation state lives HERE, above the panel, so closing and
 * reopening within a visit keeps the exchange; layouts persist across
 * marketing navigations, so it survives those too. Nothing persists past
 * the visit. Answers render as plain text nodes (no markdown, no HTML).
 *
 * Focus behavior ("appropriately" for a NON-MODAL corner panel): the
 * panel is role="dialog" but not aria-modal — the page behind stays
 * reachable; focus moves to the input on open, Escape closes from
 * anywhere inside, and focus returns to the launcher on close.
 */

type DisplayItem =
  | { kind: "user"; content: string }
  | { kind: "assistant"; content: string; citations: SupportCitation[] }
  | { kind: "fallback"; variant: FallbackVariant };

type FallbackVariant = "rate_limited" | "resting" | "unavailable";

const MAX_HISTORY = 12;

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
        <QuietLink href="/documentation">documentation</QuietLink>{" "}
        covers every part of the product, and the{" "}
        <QuietLink href="/contact">contact page</QuietLink>{" "}
        reaches a person.
      </p>
    );
  }
  return (
    <p>
      I could not answer just now. Everything I know is in the{" "}
      <QuietLink href="/documentation">documentation</QuietLink>, and you can{" "}
      always <QuietLink href="/contact">tell us directly</QuietLink>.
    </p>
  );
}

/**
 * One assistant-voice block: plain ink text on the conversation ground —
 * the unbubbled voice of the surface itself, distinct from the visitor's
 * filled bubbles.
 */
function AssistantBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[92%] text-[14px] leading-[1.65] text-foreground">
      {children}
    </div>
  );
}

export function SupportLauncher() {
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);

  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // The mount gate. An anonymous visitor's probe 404s and nothing renders.
  useEffect(() => {
    let active = true;
    fetch("/api/support", { method: "GET" })
      .then((response) => {
        if (active && response.ok) setAllowed(true);
      })
      .catch(() => {
        // Stay invisible on any failure — the launcher is never the page's problem.
      });
    return () => {
      active = false;
    };
  }, []);

  // Keep the newest turn in view as the conversation grows.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [items, pending, open]);

  // Focus the composer when the panel opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!allowed) return null;

  function close() {
    setOpen(false);
    launcherRef.current?.focus();
  }

  async function send() {
    const question = input.trim();
    if (!question || pending) return;

    const nextItems: DisplayItem[] = [
      ...items,
      { kind: "user", content: question },
    ];
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
        const variant: FallbackVariant =
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
    <>
      {open ? (
        <div
          role="dialog"
          aria-label="Support assistant"
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col overflow-hidden rounded-t-2xl border border-hairline bg-background shadow-2xl min-[480px]:inset-x-auto min-[480px]:bottom-[88px] min-[480px]:right-6 min-[480px]:h-[560px] min-[480px]:max-h-[calc(100dvh-120px)] min-[480px]:w-[380px] min-[480px]:rounded-2xl"
        >
          {/* Layer 1: the header, on the page ground. */}
          <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="inline-block h-[7px] w-[7px] rounded-full bg-primary"
              />
              <div>
                <p className="text-[13.5px] font-medium tracking-[-0.005em] text-foreground">
                  Support assistant
                </p>
                <p className="text-[11.5px] leading-[1.4] text-muted-foreground">
                  Here for questions about the product.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close the support assistant"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
            >
              <XIcon className="size-4" aria-hidden />
            </button>
          </div>

          {/* Layer 2: the conversation, on a recessed ground so the turns
              and the composer read as distinct layers (the contrast
              hierarchy the embedded panel lacked). */}
          <div
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-label="Conversation with the support assistant"
            className="flex flex-1 flex-col gap-4 overflow-y-auto bg-paper-2 px-4 py-4"
          >
            {/* The honest one-line self-introduction, always present. */}
            <AssistantBlock>
              <p>
                Welcome. Ask me anything about how legalOS works, and
                I&rsquo;ll answer from the documentation, with the guides
                linked so you can go deeper.
              </p>
            </AssistantBlock>

            {items.map((item, i) =>
              item.kind === "user" ? (
                /* The visitor's voice: a filled ink bubble, right-aligned. */
                <div
                  key={i}
                  className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-foreground px-3.5 py-2 text-[14px] leading-[1.6] text-background"
                >
                  {item.content}
                </div>
              ) : item.kind === "assistant" ? (
                <AssistantBlock key={i}>
                  <div className="flex flex-col gap-2">
                    {item.content.split(/\n{2,}/).map((para, j) => (
                      <p key={j} className="whitespace-pre-wrap">
                        {para}
                      </p>
                    ))}
                    {item.citations.length > 0 ? (
                      <p className="text-[12px] leading-[1.6] text-muted-foreground">
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
                </AssistantBlock>
              ) : (
                <AssistantBlock key={i}>
                  <FallbackBody variant={item.variant} />
                </AssistantBlock>
              ),
            )}

            {pending ? (
              <AssistantBlock>
                <p
                  aria-label="The assistant is writing"
                  className="text-muted-foreground"
                >
                  <span className="motion-safe:animate-pulse">
                    Reading the documentation&hellip;
                  </span>
                </p>
              </AssistantBlock>
            ) : null}
          </div>

          {/* Layer 3: the composer, back on the light ground — clearly
              lighter than the conversation behind it. */}
          <form
            ref={formRef}
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
            className="border-t border-hairline bg-background px-4 py-3"
          >
            <div className="flex items-end gap-2.5">
              <textarea
                ref={inputRef}
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
                placeholder="What would you like to know?"
                aria-label="Your question for the support assistant"
                className="min-h-[38px] w-full resize-none rounded-lg border border-hairline bg-background px-3 py-2 text-[14px] leading-[1.6] text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
              <button
                type="submit"
                disabled={pending || input.trim().length === 0}
                className="shrink-0 rounded-lg bg-foreground px-3.5 py-2 text-[13.5px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
              >
                Send
              </button>
            </div>
            <p className="mt-2 text-[11.5px] leading-[1.5] text-muted-foreground">
              Nothing is saved past this visit. Prefer a person?{" "}
              <QuietLink href="/contact">Tell us directly</QuietLink>.
            </p>
          </form>
        </div>
      ) : null}

      {/* The launcher itself: quiet, fixed, and motionless by rule. */}
      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={
          open ? "Close the support assistant" : "Ask the support assistant"
        }
        className={`fixed bottom-5 right-5 z-50 h-12 w-12 items-center justify-center rounded-full border border-hairline bg-foreground text-background shadow-lg transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none min-[480px]:bottom-6 min-[480px]:right-6 min-[480px]:flex ${open ? "hidden" : "flex"}`}
      >
        {open ? (
          <XIcon className="size-5" aria-hidden />
        ) : (
          <MessageCircleIcon className="size-5" aria-hidden />
        )}
      </button>
    </>
  );
}
