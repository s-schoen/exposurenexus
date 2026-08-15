import { AssetIdentifierType, validateAssetIdentifier } from "@exposurenexus/types/model/asset";
import { Check, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { capitalizeFirstLetter } from "@/lib/format.ts";

import type {
  AssetIdentifierRecord,
  CreateAssetIdentifier,
} from "@exposurenexus/types/model/asset";
import type { ReactNode } from "react";

export interface AssetIdentifierDraft {
  type: AssetIdentifierType;
  namespace: string;
  value: string;
}

interface IdentifierRowProps {
  draft: AssetIdentifierDraft;
  index: number;
  onChange: (draft: AssetIdentifierDraft) => void;
  onRemove: () => void;
  onSave?: () => void | Promise<void>;
  saveLabel?: string;
}

function toDraft(identifier: CreateAssetIdentifier | AssetIdentifierRecord): AssetIdentifierDraft {
  return {
    type: identifier.type,
    namespace: identifier.namespace ?? "",
    value: identifier.value,
  };
}

function toIdentifier(draft: AssetIdentifierDraft): CreateAssetIdentifier {
  return {
    type: draft.type,
    namespace: draft.namespace === "" ? undefined : draft.namespace,
    value: draft.value,
  };
}

function canonicalizeDraft(draft: AssetIdentifierDraft): AssetIdentifierDraft {
  const result = validateAssetIdentifier(toIdentifier(draft));
  if (!result.success) {
    return draft;
  }

  return {
    type: result.data.type,
    namespace: result.data.namespace ?? "",
    value: result.data.value,
  };
}

function validationMessage(draft: AssetIdentifierDraft): string | null {
  const result = validateAssetIdentifier(toIdentifier(draft));
  return result.success ? null : (result.issues[0]?.message ?? "Identifier is invalid.");
}

function IdentifierRow({
  draft,
  index,
  onChange,
  onRemove,
  onSave,
  saveLabel = "Save identifier",
}: IdentifierRowProps) {
  const error = validationMessage(draft);
  const inputId = `asset-identifier-${index}`;
  const updateDraft = (changes: Partial<AssetIdentifierDraft>) => {
    onChange({ ...draft, ...changes });
  };
  const normalize = () => onChange(canonicalizeDraft(draft));

  return (
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <label htmlFor={`${inputId}-type`} className="text-sm font-medium">
            Type
          </label>
          <Select
            value={draft.type}
            onValueChange={(value) => updateDraft({ type: value as AssetIdentifierType })}
          >
            <SelectTrigger id={`${inputId}-type`} aria-label={`Identifier type ${index + 1}`}>
              <SelectValue>{capitalizeFirstLetter(draft.type)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.values(AssetIdentifierType).map((type) => (
                  <SelectItem key={type} value={type}>
                    {capitalizeFirstLetter(type)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${inputId}-namespace`} className="text-sm font-medium">
            Namespace <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Input
            id={`${inputId}-namespace`}
            aria-label={`Identifier namespace ${index + 1}`}
            value={draft.namespace}
            onChange={(event) => updateDraft({ namespace: event.target.value })}
            onBlur={normalize}
            placeholder="Global scope"
            autoComplete="off"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${inputId}-value`} className="text-sm font-medium">
          Canonical value
        </label>
        <div className="flex items-start gap-2">
          <Input
            id={`${inputId}-value`}
            aria-label={`Identifier value ${index + 1}`}
            value={draft.value}
            onChange={(event) => updateDraft({ value: event.target.value })}
            onBlur={normalize}
            placeholder="Enter an external identity"
            autoComplete="off"
            aria-invalid={error !== null}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove identifier ${index + 1}`}
            title="Remove identifier"
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {onSave ? (
          <Button type="button" variant="outline" size="sm" onClick={() => void onSave()}>
            <Check />
            {saveLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

interface AssetIdentifierSectionProps {
  children: ReactNode;
  onAdd: () => void;
}

function AssetIdentifierSection({ children, onAdd }: AssetIdentifierSectionProps) {
  return (
    <section className="space-y-3" aria-labelledby="asset-identifiers-heading">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 id="asset-identifiers-heading" className="text-sm font-semibold">
            Asset identifiers
          </h3>
          <p className="text-xs text-muted-foreground">
            External identities are canonicalized before they are saved.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus />
          Add identifier
        </Button>
      </div>
      {children}
    </section>
  );
}

export interface AssetIdentifierEditorProps {
  value: ReadonlyArray<CreateAssetIdentifier>;
  onChange: (value: Array<CreateAssetIdentifier>) => void;
}

export function AssetIdentifierEditor({ value, onChange }: AssetIdentifierEditorProps) {
  const drafts = value.map(toDraft);

  return (
    <AssetIdentifierSection
      onAdd={() =>
        onChange([...value, { type: AssetIdentifierType.DnsName, namespace: undefined, value: "" }])
      }
    >
      {drafts.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          No identifiers. Assets can be managed without an external identity.
        </p>
      ) : (
        <div className="space-y-3">
          {drafts.map((draft, index) => (
            <IdentifierRow
              key={index}
              draft={draft}
              index={index}
              onChange={(updatedDraft) => {
                const next = [...drafts];
                next[index] = updatedDraft;
                onChange(next.map(toIdentifier));
              }}
              onRemove={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
            />
          ))}
        </div>
      )}
    </AssetIdentifierSection>
  );
}

export interface AssetIdentifierManagerProps {
  identifiers: ReadonlyArray<AssetIdentifierRecord>;
  onAdd: (
    identifier: CreateAssetIdentifier,
  ) => void | AssetIdentifierRecord | null | Promise<void | AssetIdentifierRecord | null>;
  onUpdate: (identifierId: string, identifier: CreateAssetIdentifier) => void | Promise<void>;
  onRemove: (identifierId: string) => void | Promise<void>;
}

function ManagedIdentifierRow({
  identifier,
  index,
  onUpdate,
  onRemove,
}: {
  identifier: AssetIdentifierRecord;
  index: number;
  onUpdate: AssetIdentifierManagerProps["onUpdate"];
  onRemove: AssetIdentifierManagerProps["onRemove"];
}) {
  const [draft, setDraft] = useState(() => toDraft(identifier));

  return (
    <IdentifierRow
      draft={draft}
      index={index}
      onChange={setDraft}
      onRemove={() => void onRemove(identifier.id)}
      onSave={() => onUpdate(identifier.id, toIdentifier(canonicalizeDraft(draft)))}
      saveLabel="Update identifier"
    />
  );
}

export function AssetIdentifierManager({
  identifiers,
  onAdd,
  onUpdate,
  onRemove,
}: AssetIdentifierManagerProps) {
  const [draft, setDraft] = useState<AssetIdentifierDraft | null>(null);

  return (
    <AssetIdentifierSection
      onAdd={() => setDraft({ type: AssetIdentifierType.DnsName, namespace: "", value: "" })}
    >
      {identifiers.length === 0 && !draft ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          No identifiers. Add one when an external identity is known.
        </p>
      ) : (
        <div className="space-y-3">
          {identifiers.map((identifier, index) => (
            <ManagedIdentifierRow
              key={identifier.id}
              identifier={identifier}
              index={index}
              onUpdate={onUpdate}
              onRemove={onRemove}
            />
          ))}
          {draft ? (
            <IdentifierRow
              draft={draft}
              index={identifiers.length}
              onChange={setDraft}
              onRemove={() => setDraft(null)}
              onSave={async () => {
                const normalized = canonicalizeDraft(draft);
                if (validationMessage(normalized)) {
                  return;
                }
                const added = await onAdd(toIdentifier(normalized));
                if (added !== null) {
                  setDraft(null);
                }
              }}
              saveLabel="Add identifier"
            />
          ) : null}
        </div>
      )}
    </AssetIdentifierSection>
  );
}
