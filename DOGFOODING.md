# Dogfooding checklist

Operator-driven, in-product validation of the Knowledge and built-in-agents work, run against REAL documents (not fixtures). This is the human judgment that automated tests cannot give: does the feature actually feel right, and are the model-produced parts (extractions, citations, prose, redlines) correct against real contracts.

**Status: standing, operator-driven, NOT blocking other work.** Pick items up opportunistically. Check boxes as you go; note what you found inline so the next pass starts from reality. When an item surfaces a real defect, file it as its own roadmap item or fix; this file tracks the *validation*, not the fixes.

The cheap tuning loop for the model-produced parts:
- **Built-in agent prompts:** edit `lib/content/builtin-agents-seed.ts` and re-run `npm run seed-builtin-agents` (updates the live rows in place, D-181).
- **Extraction quality:** the lever is the attribute `description` (the load-bearing field, D-198/D-199). Edit the schema in Collections → Define schema, save (bumps the version), then run Update to re-extract.

---

## 1. Structured Query, end to end

The full define → prepare → ask path on a real collection (D-197 through D-201).

- [ ] **Define a schema.** In Collections → Define schema, add a realistic attribute set (e.g. agreement type, counterparty, effective date, governing law, auto-renews, contract value). Judge the schema-builder dialog's clarity: are the type choices obvious, is the description field's importance conveyed, are enum options easy to enter?
- [ ] **Prepare (first run).** Run Prepare on the card. Confirm it reads the documents and the honest basis line reports prepared/unreadable/found/not-found counts truthfully.
- [ ] **Prepare/Update states.** Confirm the card shows the right state at each step: not prepared → ready after Prepare; edit the schema (or let a document change) → needs updating; Update re-extracts only the stale work, then ready.
- [ ] **Ask real questions.** On the Structured Query page, ask several real questions (a count, a filter, a group-by, a presence question like "how many are missing an effective date").
- [ ] **Interpreted-query display.** Confirm the plain-language "Interpreted as: ..." line matches what you actually asked, and is understandable to a non-engineer.
- [ ] **Citations.** Open the matching documents and confirm the supporting quote per field is real and verified against the source; spot-check a "verified" and any "not verified" marker.
- [ ] **Honesty caveats.** Where applicable, confirm the reachable "How this count was reached" lines (unverified citations, not-found, partially read, unparsed) are accurate against the real documents, not over- or under-claimed.
- [ ] **Re-run / adjust.** Re-run a recent question (byte-identical over unchanged data) and use "Adjust this question" to refine.

## 2. Schema-grows-on-demand (the loop closes)

The suggest → approve → extract flow (D-202).

- [ ] **Hit the gap.** Ask about a field the collection does NOT track; confirm the honest gap names what IS tracked.
- [ ] **Suggest it.** Use "Suggest tracking it". Judge the model's drafted definition (label, type, options, description): is it sensible, or does the description need editing?
- [ ] **Approve as admin.** Review and edit the draft in the suggested-fields review, then Approve. Confirm the attribute is added and the collection flips to needs-updating (no auto-extraction, no surprise cost).
- [ ] **Update, then close the loop.** Run Update, then re-ask the original question and confirm it now returns a real, cited answer.
- [ ] **Approval boundary.** Confirm a non-admin sees "awaiting approval" and cannot approve; an admin (including an admin who suggested it) can approve directly. (Changing who may approve is the single gate `canApproveSchemaSuggestion`.)

## 3. Extraction quality (the model-produced values)

Does extraction actually match real contracts (D-199).

- [ ] **Value accuracy.** Spot-check extracted values against the source documents: are numbers, dates, parties, and enum classifications correct?
- [ ] **Citation truthfulness.** Do the stored quotes actually appear in the documents, and do they support the value? Confirm the verified/unverified flag is honest.
- [ ] **Not-found honesty.** For documents where a field genuinely is not present, is it recorded as not-found (never guessed)? Are truncated-read not-founds qualified?
- [ ] **Description tuning.** Where extractions are weak, tune the attribute `description` and re-run Update; note which descriptions needed work, as a guide for good schema authoring.

## 4. The six built-in General Tools agents on real docs

The "Powered by legalOS" agents (D-181, D-187).

- [ ] **Run each on real documents** and judge usefulness and tone.
- [ ] **PII flagger framing.** Watch that it stays appropriately humble ("review aid, not a guarantee") and never implies completeness.
- [ ] **Obligations and dates extractor over-inclusion.** It deliberately leans toward over-inclusion; confirm it catches borderline items without drowning the signal.
- [ ] **Tune prompts in place** where real use shows weakness (edit `builtin-agents-seed.ts`, re-run `npm run seed-builtin-agents`).

## 5. Document Comparison on two real versions

The deterministic-comparison flagship (D-185 through D-193).

- [ ] **Redline + prose.** Compare a real original and revised version; confirm the inline redline (insertions underlined, deletions struck, replacements old-before-new) and the plain-language "what changed and what matters" agree, since both come from one deterministic change set.
- [ ] **Reload behavior.** Reload the conversation and confirm the redline survives (rehydrated from the stored change set, D-193), identical to the live turn.
- [ ] **Edge cases.** Identical inputs report "no changes"; a document too long to read fully is flagged as a partial comparison in both views.

## 6. Research on a real run

The deterministic research engine (D-153 through D-196).

- [ ] **Pre-run scope signal.** Confirm the preview (about-N-documents, rough time) reads honestly before the run.
- [ ] **Over-cap messages.** Exceed the per-run document cap and confirm the message names the count and the limit and the path to narrow or raise it; trigger the enumeration-budget limit if reachable and confirm it fails honestly post-enumeration.
- [ ] **Honest not-found / unreadable.** Confirm the answer's basis line plainly reports anything that could not be read, and citations + per-document findings are verifiable against the sources.

## 7. Structured Query empty-state deep-link

The "Define fields" deep-link from the empty state (D-203).

- [ ] **Right collection.** From a collection that is synced but has no schema, confirm the Structured Query page shows the State A message naming that collection, and the "Define fields" button lands on Collections with the define-schema dialog already open for that exact collection.
- [ ] **Other states.** Confirm the no-collection state (admin) offers "Set up a collection", and the non-admin state shows the honest wait message with no dead-end button.
