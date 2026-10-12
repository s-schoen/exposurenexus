import { AssetIdentifierType } from "@exposurenexus/contracts/model/asset";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { FormActions } from "@/components/form-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field.tsx";
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
import { validateAssetIdentifier } from "@/features/assets/lib/asset-identifier/schema";

import type {
  AssetIdentifierRecord,
  CreateAssetIdentifier,
} from "@exposurenexus/contracts/model/asset";
import type { FormEvent } from "react";

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
        <Field>
          <FieldLabel htmlFor={`${inputId}-type`}>Type</FieldLabel>
          <Select
            value={draft.type}
            onValueChange={(value) => updateDraft({ type: value as AssetIdentifierType })}
            disabled={disabled}
          >
            <SelectTrigger
              id={`${inputId}-type`}
              aria-label={`Identifier type${labelSuffix}`}
              className="w-full"
            >
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
        </Field>
        <Field>
          <FieldLabel htmlFor={`${inputId}-namespace`}>
            Namespace
            <span className="text-muted-foreground">(optional)</span>
          </FieldLabel>
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
        </Field>
      </div>
      <Field data-invalid={showError && error !== null}>
        <FieldLabel htmlFor={`${inputId}-value`}>Canonical value</FieldLabel>
        <div className="flex items-center gap-2">
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
              size="icon"
              aria-label={`Remove identifier${labelSuffix}`}
              title="Remove identifier"
              onClick={onRemove}
              disabled={disabled}
            >
              <Trash2 />
            </Button>
          ) : null}
        </div>
        {showError && error ? <FieldError>{error}</FieldError> : null}
      </Field>
    </>
  );
}

function IdentifierRow({ draft, index, onChange, onRemove }: IdentifierRowProps) {
  const inputId = `asset-identifier-${index}`;
  const normalize = () => onChange(canonicalizeDraft(draft));

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
      <IdentifierFields
        draft={draft}
        inputId={inputId}
        onChange={onChange}
        onNormalize={normalize}
        onRemove={onRemove}
        ariaLabelSuffix={String(index + 1)}
      />
    </div>
  );
}

export interface AssetIdentifierEditorProps {
  value: ReadonlyArray<CreateAssetIdentifier>;
  onChange: (value: Array<CreateAssetIdentifier>) => void;
}

/** The identifier list in the create-asset form: a gray tray of identifier rows. */
export function AssetIdentifierEditor({ value, onChange }: AssetIdentifierEditorProps) {
  const drafts = value.map(toDraft);

  return (
    <FieldSet>
      <FieldLegend variant="label">Identifiers</FieldLegend>
      <div className="flex flex-col gap-1.5 rounded-lg bg-muted p-1.5">
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() =>
            onChange([
              ...value,
              { type: AssetIdentifierType.DnsName, namespace: undefined, value: "" },
            ])
          }
        >
          <Plus />
          Add identifier
        </Button>
      </div>
    </FieldSet>
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
    <form className="flex flex-col gap-6" onSubmit={(event) => void handleSubmit(event)}>
      <FieldGroup>
        <IdentifierFields
          draft={draft}
          inputId="asset-identifier-dialog"
          onChange={setDraft}
          onNormalize={() => setDraft(canonicalizeDraft(draft))}
          disabled={pending}
          showError={showError}
        />
      </FieldGroup>
      <FormActions>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          {submitLabel}
        </Button>
      </FormActions>
    </form>
  );
}
