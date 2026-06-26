# Deterministic operations

This module is the trustworthy spine of the product: **deterministic operations**
that the non-deterministic agent layer consumes but never overrides. A model
explains or summarizes on top of a result it cannot alter.

There are two such operations today. **Document comparison** (`compare/`) is the
first. **Structured Query** (`structured-query/`) is the second: a pure engine
that answers an exact, repeatable count / filter / group-by question over a
collection's already-extracted, typed values. More are expected later (for
example, full structured search / retrieval for the Knowledge section).

## The deterministic-operation contract (the standard)

A deterministic operation is:

- a **pure function** from fully-specified, typed inputs to a fully-specified,
  typed, structured result;
- **deterministic**: the same inputs always produce byte-identical output;
- **no I/O, no model, no clock, no randomness, no network, no hidden state, no
  side effects**;
- **exhaustively unit-testable in isolation**, with the highest test density in
  the codebase.

`compareDocuments` and `runStructuredQuery` both conform to this exactly. Future
deterministic operations (e.g. full Knowledge search) are expected to meet the
same standard.

## Restraint: one honest tenant, no framework

This is a **foundation, not a framework**. There is deliberately **no shared base
type, no operation registry, no plugin system, and no cross-operation
scaffold** — those would be premature abstraction presuming operations that do
not exist yet. The standard above is a documented expectation, not an enforced
interface.

The reusable thing here is a **pattern**, not shared code: a deterministic
operation produces a typed structured result from typed inputs through
independently-testable pure code. The second operation has now arrived
(`structured-query/`), and it confirms the restraint rather than overturning it:
the two operations are shaped quite differently — comparison is a four-stage text
pipeline (normalize → segment → diff → emit), Structured Query is a single pivot
+ predicate-evaluation + aggregate over already-typed rows — so there is still
**no shared base type worth extracting**, no registry, and no framework. Each is
one honest tenant, built well; a third operation, if it rhymes with one of these,
is when any shared shape gets reconsidered.

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

### The two layers, named (and where Structured Query lives)

The architecture already runs on a two-layer split, worth stating plainly so the
next operation has a defined home. A **pure operation** is the standard above
(D-185): a pure function, no I/O, model, clock, or randomness, exhaustively
unit-testable, producing a typed structured result — `compareDocuments` today,
and the future `runStructuredQuery` query engine. An **impure pre-step consumer**
is the code that produces that operation's input: it does I/O and may call a
model, so it is **model-driven but VERIFIABLE** (cited, bounded, re-runnable) —
the same status Research has, not the determinism standard. **Structured Query
spans both layers, by design:** its EXTRACTION (reading documents, asking a model
to pull each defined attribute with citations, commit 3) lives in the impure,
verifiable layer; its QUERY (counting and filtering the extracted structured
values to answer a question, commit 4) is a pure operation held to the full
determinism standard. That split is now realized: the pure query engine lives in
`structured-query/` (below), and its impure reader lives in
`lib/knowledge/structured-query.ts` — separate from the model-driven extraction
that feeds it.

## The structured-query engine (`structured-query/`)

The second pure operation (D-200). `runStructuredQuery(rows, query)` takes the
already-extracted values (one `ExtractedAttributeValue` per document+attribute,
loaded by the impure reader) and a typed `StructuredQuery`, and returns an exact,
repeatable `StructuredQueryResult`. It meets the standard above exactly: pure, no
I/O / model / clock / randomness / hidden state, and exhaustively unit-tested
(every predicate and operator, both combinators, group-by, type-correct column
selection, the honesty caveats, the edges, and a shuffled-input determinism
proof).

- **`contract.ts`** — the three binding types: the engine's input row, the query
  IR, and the result. The IR is a FLAT list of predicates combined by one
  top-level `match` ("all" = AND, "any" = OR), with OR-within-an-attribute via
  `text_one_of` / `*_between` and an optional `groupBy`. No nested boolean tree:
  a small, bounded shape is a reliable model-translation target (commit 5) and a
  bounded persisted artifact. See the file's doc comment for the full rationale.
- **`schema.ts`** — the zod bounds for the IR (the write boundary commit 5's
  model output is validated against), beside the contract so type and validator
  cannot drift.
- **`engine.ts`** — the pure engine. It pivots rows into one attribute map per
  document, evaluates predicates, and aggregates. Determinism is unconditional:
  rows are fully sorted before pivoting, and every emitted list has a defined
  total order (matched ids ascending; groups by count desc, found-before-not-found,
  then value asc by code unit — never `localeCompare`).

Two design properties make the count TRUSTWORTHY, not just exact:

- **Type-correct column selection.** Each predicate reads exactly one typed
  column (number → `value_number`, date → `value_date` as lexicographically-sortable
  ISO, boolean → `value_boolean`, text/enum → `value_text`); group-by reads the
  column for the row's SNAPSHOTTED `attribute_type`, so it never depends on the
  mutable live schema. A value found but unparsed into its typed column cannot
  be silently coerced; it is excluded and surfaced.
- **Honest, explicit caveats.** A value predicate matches only documents where
  the attribute was FOUND, so a not-found is never silently a match. The result
  surfaces, as counts: matched-on-unverified-citation (the value still counts,
  but the count says how many rest on an unverified quote), matched-on-truncated-read,
  excluded-not-found (and how many of those came from a truncated read, so a
  not-found is qualified, not overclaimed), excluded-unparsed-value, and
  not-extracted (no row at all, distinct from an honest not-found). Group-by emits
  a synthetic not-found bucket so "how many of each version, and how many we could
  not find a version for" is one honest distribution.

The impure reader `runCollectionStructuredQuery` (`lib/knowledge/structured-query.ts`)
is the only I/O: it loads a collection's prepared rows under RLS and hands them to
the engine. The natural-language → query translation and the user-facing
question UI ride ON TOP of this in commit 5; neither lives here.

### Out of scope for v1 (future layers)

- Structural / clause-level / semantic-equivalence diffing (moved clauses,
  reordered sections, "means the same thing"). v1 is word-level textual diff.
- The agent row, seeding, UI, redline renderer, and model prose — all later
  commits. This module is the engine only; the pre-step that consumes it (above)
  ships inert until the comparison agent is seeded.
