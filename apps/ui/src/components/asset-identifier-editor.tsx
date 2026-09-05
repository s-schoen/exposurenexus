import { AssetIdentifierType } from "@exposurenexus/contracts/model/asset";
import { Check, Plus, Trash2, X } from "lucide-react";
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
import { Spinner } from "@/components/ui/spinner.tsx";
import { validateAssetIdentifier } from "@/lib/asset-identifier/schema";

import type {
  AssetIdentifierRecord,
  CreateAssetIdentifier,
} from "@exposurenexus/contracts/model/asset";
import type { FormEvent, ReactNode } from "react";

export interface AssetIdentifierDraft {
  type: AssetIdentifierType;
  namespace: string;
  value: string;
}

export function identifierTypeLabel(type: AssetIdentifierType): string {
  switch (type) {
    case AssetIdentifierType.DnsName:
      return "DNS name";
    case AssetIdentifierType.IpAddress:
      return "IP address";
    case AssetIdentifierType.VcsRepository:
      return "VCS repository";
    case AssetIdentifierType.OciImageName:
      return "OCI image";
    case AssetIdentifierType.CloudResourceId:
      return "Cloud resource ID";
  }
}

interface IdentifierRowProps {
  draft: AssetIdentifierDraft;
  index: number;
  onChange: (draft: AssetIdentifierDraft) => void;
  onRemove: () => void;
  onSave?: () => void | Promise<void>;
  saveLabel?: string;
}

interface IdentifierFieldsProps {
  draft: AssetIdentifierDraft;
  inputId: string;
  onChange: (draft: AssetIdentifierDraft) => void;
  onNormalize: () => void;
  onRemove?: () => void;
  disabled?: boolean;
  showError?: boolean;
  ariaLabelSuffix?: string;
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

function IdentifierFields({
  draft,
  inputId,
  onChange,
  onNormalize,
  onRemove,
  disabled = false,
  showError = true,
  ariaLabelSuffix,
}: IdentifierFieldsProps) {
  const error = validationMessage(draft);
  const labelSuffix = ariaLabelSuffix ? ` ${ariaLabelSuffix}` : "";
  const updateDraft = (changes: Partial<AssetIdentifierDraft>) => {
    onChange({ ...draft, ...changes });
  };

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <label htmlFor={`${inputId}-type`} className="text-sm font-medium">
            Type
          </label>
          <Select
            value={draft.type}
            onValueChange={(value) => updateDraft({ type: value as AssetIdentifierType })}
            disabled={disabled}
          >
            <SelectTrigger id={`${inputId}-type`} aria-label={`Identifier type${labelSuffix}`}>
              <SelectValue>{identifierTypeLabel(draft.type)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.values(AssetIdentifierType).map((type) => (
                  <SelectItem key={type} value={type}>
                    {identifierTypeLabel(type)}
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
            aria-label={`Identifier namespace${labelSuffix}`}
            value={draft.namespace}
            onChange={(event) => updateDraft({ namespace: event.target.value })}
            onBlur={onNormalize}
            placeholder="Global scope"
            autoComplete="off"
            disabled={disabled}
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
            aria-label={`Identifier value${labelSuffix}`}
            value={draft.value}
            onChange={(event) => updateDraft({ value: event.target.value })}
            onBlur={onNormalize}
            placeholder="Enter an external identity"
            autoComplete="off"
            aria-invalid={showError && error !== null}
            disabled={disabled}
          />
          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove identifier${labelSuffix}`}
              title="Remove identifier"
              onClick={onRemove}
              disabled={disabled}
            >
              <Trash2 />
            </Button>
          ) : null}
        </div>
        {showError && error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </>
  );
}

function IdentifierRow({
  draft,
  index,
  onChange,
  onRemove,
  onSave,
  saveLabel = "Save identifier",
}: IdentifierRowProps) {
  const inputId = `asset-identifier-${index}`;
  const normalize = () => onChange(canonicalizeDraft(draft));

  return (
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <IdentifierFields
        draft={draft}
        inputId={inputId}
        onChange={onChange}
        onNormalize={normalize}
        onRemove={onRemove}
        ariaLabelSuffix={String(index + 1)}
      />
      {onSave ? (
        <Button type="button" variant="outline" size="sm" onClick={() => void onSave()}>
          <Check />
          {saveLabel}
        </Button>
      ) : null}
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

export interface AssetIdentifierFormProps {
  defaultValue?: CreateAssetIdentifier | AssetIdentifierRecord;
  onSubmit: (identifier: CreateAssetIdentifier) => Promise<AssetIdentifierRecord | null>;
  onCancel: () => void;
  pending?: boolean;
  submitLabel: string;
}

export function AssetIdentifierForm({
  defaultValue,
  onSubmit,
  onCancel,
  pending = false,
  submitLabel,
}: AssetIdentifierFormProps) {
  const [draft, setDraft] = useState<AssetIdentifierDraft>(() =>
    toDraft(
      defaultValue ?? {
        type: AssetIdentifierType.DnsName,
        namespace: undefined,
        value: "",
      },
    ),
  );
  const [submitted, setSubmitted] = useState(false);
  const showError = submitted || draft.namespace.length > 0 || draft.value.length > 0;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    const normalized = canonicalizeDraft(draft);
    setDraft(normalized);

    if (validationMessage(normalized)) {
      return;
    }

    const saved = await onSubmit(toIdentifier(normalized));
    if (saved !== null) {
      onCancel();
    }
  };

  return (
    <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
      <IdentifierFields
        draft={draft}
        inputId="asset-identifier-dialog"
        onChange={setDraft}
        onNormalize={() => setDraft(canonicalizeDraft(draft))}
        disabled={pending}
        showError={showError}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          <X />
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner /> : <Check />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
