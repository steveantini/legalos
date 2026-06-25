# Deterministic operations

This module is the trustworthy spine of the product: **deterministic operations**
that the non-deterministic agent layer consumes but never overrides. A model
explains or summarizes on top of a result it cannot alter.

**Document comparison** (`compare/`) is the first such operation. More are
expected later (for example, structured search / retrieval for the Knowledge
section), but none exist yet.

## The deterministic-operation contract (the standard)

A deterministic operation is:

- a **pure function** from fully-specified, typed inputs to a fully-specified,
  typed, structured result;
- **deterministic**: the same inputs always produce byte-identical output;
- **no I/O, no model, no clock, no randomness, no network, no hidden state, no
  side effects**;
- **exhaustively unit-testable in isolation**, with the highest test density in
  the codebase.

`compareDocuments` conforms to this exactly. Future deterministic operations
(e.g. Knowledge search) are expected to meet the same standard.

## Restraint: one honest tenant, no framework

This is a **foundation, not a framework**. There is deliberately **no shared base
type, no operation registry, no plugin system, and no cross-operation
scaffold** — those would be premature abstraction presuming operations that do
not exist yet. The standard above is a documented expectation, not an enforced
interface.

The reusable thing here is a **pattern**, not shared code: a deterministic
operation is a pipeline of independently-testable pure stages producing a typed
structured result. When a second operation actually arrives, it will inform
whatever shared shape (if any) is then worth extracting. Until then: one tenant,
built well.

## The comparison pipeline (`compare/`)

Four independently pure, independently tested stages:

1. **normalize** (`normalize.ts`) — canonicalize whitespace / line endings on
   already-extracted plain text (the `lib/extract` layer already stripped
   document formatting; this does not re-extract). v1 treats whitespace amount
   as non-material; word boundaries are preserved.
2. **segment** (`segment.ts`) — losslessly tokenize the normalized text into
   comparable units with explicit spans. WORD-level in v1; granularity is a
   parameter so sentence / line / character can be added later (not built now).
3. **diff** (`diff.ts`) — the deterministic alignment, with jsdiff (`diffArrays`)
   as the core **wrapped behind our types** so the library never leaks and can be
   swapped.
4. **emit** (`emit.ts`) — build the change-set contract: a unified, ordered,
   lossless sequence of `equal | insert | delete | replace` segments (with
   `replace` coalesced from adjacent edits), each carrying spans into both
   documents, plus a derived summary.

The change-set shape (`contract.ts`) is designed to serve **both** a visual
redline renderer and a model reading it as authoritative input. See that file's
doc comment for the rationale.

### How comparison is consumed: the deterministic PRE-STEP pattern

This engine is pure and consumer-agnostic; consumers live on the agent/run side
and import it (never the reverse). The first consumer is the **document-compare
pre-step** (`lib/agents/pre-steps/document-compare.ts`), which establishes a
named pattern (DECISION_LOG D-186):

> An agent can declare a **deterministic pre-step** — a pure code operation that
> runs UNCONDITIONALLY, in code, BEFORE the model call, producing a structured
> result injected as the model's AUTHORITATIVE input. The model explains the
> result; it cannot ride past it or override it. This is categorically different
> from the model-side tools in `tools_enabled` (web_search, MCP), which the model
> chooses to call.

The pre-step serializes a `ComparisonResult` into a model-facing change-set block
(every change, bounded equal context, original/revised labels, truncation
surfaced, an explicit no-changes block for identical inputs) and the run path
injects THAT in place of the raw documents — the model never receives the two
full docs as "compare these". The Knowledge section's future deterministic search
is expected to follow this same pre-step pattern. As with the engine itself
(restraint above), there is deliberately no generic pre-step framework: one
pre-step exists; the second will inform any shared shape worth extracting.

### Out of scope for v1 (future layers)

- Structural / clause-level / semantic-equivalence diffing (moved clauses,
  reordered sections, "means the same thing"). v1 is word-level textual diff.
- The agent row, seeding, UI, redline renderer, and model prose — all later
  commits. This module is the engine only; the pre-step that consumes it (above)
  ships inert until the comparison agent is seeded.
