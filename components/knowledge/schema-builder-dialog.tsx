"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  COLLECTION_ATTRIBUTE_TYPES,
  makeUniqueAttributeKey,
  MAX_COLLECTION_ATTRIBUTES,
  slugifyAttributeKey,
  type CollectionAttribute,
  type CollectionAttributeType,
} from "@/lib/knowledge/collection-schema";

/**
 * The shared schema builder: define the set of ATTRIBUTES (fields) a document
 * kind tracks. Lifted out of the Collections view so Structured Query's
 * guided-depth setup reuses the exact editor rather than a second copy. Two
 * callers, one component:
 *  - Collections / "edit a folder's fields": no name field (the folder is named).
 *  - Structured Query / "define a new document kind": a name field, since a kind
 *    spans folders and needs its own name.
 *
 * Keys are STABLE: an attribute loaded with a key keeps it across label edits;
 * only brand-new attributes get a key derived from their label at save time.
 * This is what keeps extracted values (keyed by attribute) from being orphaned
 * when an admin renames a label.
 */

const ATTRIBUTE_TYPE_LABEL: Record<CollectionAttributeType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  boolean: "Yes / no",
  enum: "One of a set",
};

/** A draft attribute as the builder edits it; `key` is "" until first saved. */
type DraftAttribute = {
  clientId: string;
  key: string;
  label: string;
  type: CollectionAttributeType;
  description: string;
  /** Comma-separated options for an enum attribute; ignored otherwise. */
  optionsText: string;
};

/** Split the comma-separated options field into a clean, de-duplicated list. */
function parseOptionsText(text: string): string[] {
  const seen = new Set<string>();
  const options: string[] = [];
  for (const raw of text.split(",")) {
    const option = raw.trim();
    if (option && !seen.has(option)) {
      seen.add(option);
      options.push(option);
    }
  }
  return options;
}

function toDraft(attribute: CollectionAttribute): DraftAttribute {
  return {
    clientId: crypto.randomUUID(),
    key: attribute.key,
    label: attribute.label,
    type: attribute.type,
    description: attribute.description,
    optionsText: (attribute.options ?? []).join(", "),
  };
}

export type SchemaBuilderSubmit = {
  /** Present only when `requireName` is set (defining a new kind). */
  name?: string;
  attributes: CollectionAttribute[];
};

/**
 * The mutation and refresh run in the PARENT's transition (the parent stays
 * mounted), because this dialog unmounts on success and an unmounting
 * component's transition drops its scheduled router.refresh().
 */
export function SchemaBuilderDialog({
  title,
  description,
  initialAttributes,
  requireName = false,
  initialName = "",
  pending,
  saveLabel = "Save schema",
  onClose,
  onSubmit,
}: {
  title: string;
  description: string;
  initialAttributes: CollectionAttribute[];
  /** When true, render a name field and require it (defining a new kind). */
  requireName?: boolean;
  initialName?: string;
  pending: boolean;
  saveLabel?: string;
  onClose: () => void;
  onSubmit: (input: SchemaBuilderSubmit) => void;
}) {
  const [name, setName] = useState(initialName);
  const [drafts, setDrafts] = useState<DraftAttribute[]>(() =>
    initialAttributes.map(toDraft),
  );

  const atMax = drafts.length >= MAX_COLLECTION_ATTRIBUTES;

  function addAttribute() {
    if (atMax) return;
    setDrafts((prev) => [
      ...prev,
      {
        clientId: crypto.randomUUID(),
        key: "",
        label: "",
        type: "text",
        description: "",
        optionsText: "",
      },
    ]);
  }

  function updateAttribute(clientId: string, patch: Partial<DraftAttribute>) {
    setDrafts((prev) =>
      prev.map((draft) => (draft.clientId === clientId ? { ...draft, ...patch } : draft)),
    );
  }

  function removeAttribute(clientId: string) {
    setDrafts((prev) => prev.filter((draft) => draft.clientId !== clientId));
  }

  const incomplete =
    drafts.length === 0 ||
    (requireName && name.trim().length === 0) ||
    drafts.some(
      (draft) =>
        draft.label.trim().length === 0 ||
        draft.description.trim().length === 0 ||
        (draft.type === "enum" && parseOptionsText(draft.optionsText).length === 0),
    );

  function handleSave() {
    if (pending || incomplete) return;
    // Assign keys: existing keys are preserved; new attributes derive a unique
    // key from their label now (and never change it again).
    const used = new Set<string>();
    for (const draft of drafts) {
      if (draft.key) used.add(draft.key);
    }
    const attributes: CollectionAttribute[] = drafts.map((draft) => {
      let key = draft.key;
      if (!key) {
        key = makeUniqueAttributeKey(draft.label, used);
        used.add(key);
      }
      const base = {
        key,
        label: draft.label.trim(),
        type: draft.type,
        description: draft.description.trim(),
      };
      return draft.type === "enum"
        ? { ...base, options: parseOptionsText(draft.optionsText) }
        : base;
    });
    onSubmit(requireName ? { name: name.trim(), attributes } : { attributes });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {requireName ? (
          <div>
            <label htmlFor="kind-name" className="text-[12.5px] font-medium text-foreground">
              Name this document kind
            </label>
            <Input
              id="kind-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Agreements"
              className="mt-1.5 bg-background"
              maxLength={120}
            />
            <p className="mt-1 text-[11.5px] text-caption">
              What these folders hold, like Agreements or Policies.
            </p>
          </div>
        ) : null}

        <div className="flex max-h-[52vh] flex-col gap-3 overflow-y-auto">
          {drafts.length === 0 ? (
            <p className="rounded-lg bg-paper-2 px-4 py-3 text-[13px] leading-[1.5] text-muted-foreground">
              No attributes yet. Add one to describe a fact to pull from each
              document, like a counterparty, an effective date, or an agreement
              type.
            </p>
          ) : (
            drafts.map((draft) => {
              const keyPreview = draft.key || slugifyAttributeKey(draft.label);
              return (
                <div
                  key={draft.clientId}
                  className="rounded-xl border border-hairline bg-paper-2 p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor={`attr-label-${draft.clientId}`}
                        className="text-[12.5px] font-medium text-foreground"
                      >
                        Name
                      </label>
                      <Input
                        id={`attr-label-${draft.clientId}`}
                        value={draft.label}
                        onChange={(event) =>
                          updateAttribute(draft.clientId, { label: event.target.value })
                        }
                        placeholder="Effective date"
                        className="mt-1.5 bg-background"
                        maxLength={80}
                      />
                    </div>
                    <div className="w-[150px] shrink-0">
                      <label
                        htmlFor={`attr-type-${draft.clientId}`}
                        className="text-[12.5px] font-medium text-foreground"
                      >
                        Type
                      </label>
                      <select
                        id={`attr-type-${draft.clientId}`}
                        value={draft.type}
                        onChange={(event) =>
                          updateAttribute(draft.clientId, {
                            type: event.target.value as CollectionAttributeType,
                          })
                        }
                        className="mt-1.5 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-[13px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {COLLECTION_ATTRIBUTE_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {ATTRIBUTE_TYPE_LABEL[type]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttribute(draft.clientId)}
                      aria-label="Remove attribute"
                      className="mt-6 shrink-0 text-[13px] font-medium text-muted-foreground transition-colors hover:text-destructive motion-reduce:transition-none"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="mt-3">
                    <label
                      htmlFor={`attr-desc-${draft.clientId}`}
                      className="text-[12.5px] font-medium text-foreground"
                    >
                      Description
                    </label>
                    <Textarea
                      id={`attr-desc-${draft.clientId}`}
                      value={draft.description}
                      onChange={(event) =>
                        updateAttribute(draft.clientId, { description: event.target.value })
                      }
                      placeholder="The contract version number, often labeled Version or v near the title."
                      className="mt-1.5 bg-background"
                      rows={2}
                      maxLength={500}
                    />
                  </div>

                  {draft.type === "enum" ? (
                    <div className="mt-3">
                      <label
                        htmlFor={`attr-options-${draft.clientId}`}
                        className="text-[12.5px] font-medium text-foreground"
                      >
                        Options
                      </label>
                      <Input
                        id={`attr-options-${draft.clientId}`}
                        value={draft.optionsText}
                        onChange={(event) =>
                          updateAttribute(draft.clientId, { optionsText: event.target.value })
                        }
                        placeholder="NDA, MSA, SOW"
                        className="mt-1.5 bg-background"
                      />
                      <p className="mt-1 text-[11.5px] text-caption">
                        Separate the allowed values with commas.
                      </p>
                    </div>
                  ) : null}

                  <p className="mt-3 font-mono text-[11px] text-caption">
                    key: {keyPreview}
                    {draft.key ? "" : " (set on save)"}
                  </p>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addAttribute}
            disabled={atMax}
            title={
              atMax
                ? `A schema can define at most ${MAX_COLLECTION_ATTRIBUTES} attributes.`
                : undefined
            }
          >
            Add attribute
          </Button>
          {atMax ? (
            <p className="text-[11.5px] text-caption">
              Maximum of {MAX_COLLECTION_ATTRIBUTES} reached.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={pending || incomplete}
            title={
              incomplete
                ? "Give the kind a name and every attribute a name and a description (and options for a one-of type)."
                : undefined
            }
          >
            {pending ? "Saving…" : saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
