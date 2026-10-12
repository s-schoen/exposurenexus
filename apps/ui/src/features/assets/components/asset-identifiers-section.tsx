import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { FormDialog } from "@/components/form-dialog.tsx";
import { DetailSection } from "@/components/properties-panel/detail-section.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import {
  AssetIdentifierForm,
  identifierTypeLabel,
} from "@/features/assets/components/asset-identifier-editor.tsx";

import type {
  AssetIdentifierRecord,
  CreateAssetIdentifier,
} from "@exposurenexus/contracts/model/asset";

type IdentifierDialogState = { mode: "add" } | { mode: "edit"; identifier: AssetIdentifierRecord };

type PendingAction =
  | { type: "add" }
  | { type: "edit"; identifierId: string }
  | { type: "delete"; identifierId: string };

export interface AssetIdentifiersSectionProps {
  identifiers: ReadonlyArray<AssetIdentifierRecord>;
  onAdd: (identifier: CreateAssetIdentifier) => Promise<AssetIdentifierRecord | null>;
  onUpdate: (
    identifierId: string,
    identifier: CreateAssetIdentifier,
  ) => Promise<AssetIdentifierRecord | null>;
  onRemove: (identifierId: string) => Promise<AssetIdentifierRecord | null>;
}

function identifierLabel(identifier: AssetIdentifierRecord): string {
  return `${identifierTypeLabel(identifier.type)} ${identifier.value}`;
}

export function AssetIdentifiersSection({
  identifiers,
  onAdd,
  onUpdate,
  onRemove,
}: AssetIdentifiersSectionProps) {
  const [dialog, setDialog] = useState<IdentifierDialogState | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const isDialogPending = pendingAction?.type === "add" || pendingAction?.type === "edit";

  function renderActions(identifier: AssetIdentifierRecord) {
    const label = identifierLabel(identifier);
    const isDeleting =
      pendingAction?.type === "delete" && pendingAction.identifierId === identifier.id;
    const isBusy = pendingAction !== null;

    return (
      <div className="flex shrink-0 gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Edit identifier ${label}`}
          title="Edit identifier"
          onClick={() => setDialog({ mode: "edit", identifier })}
          disabled={isBusy}
        >
          <Pencil strokeWidth={1.5} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete identifier ${label}`}
          title="Delete identifier"
          onClick={() => void handleDelete(identifier)}
          disabled={isBusy}
        >
          {isDeleting ? <Spinner /> : <Trash2 strokeWidth={1.5} />}
        </Button>
      </div>
    );
  }

  async function handleSubmit(identifier: CreateAssetIdentifier) {
    if (!dialog) {
      return null;
    }

    setPendingAction(
      dialog.mode === "add"
        ? { type: "add" }
        : { type: "edit", identifierId: dialog.identifier.id },
    );
    try {
      return dialog.mode === "add"
        ? await onAdd(identifier)
        : await onUpdate(dialog.identifier.id, identifier);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDelete(identifier: AssetIdentifierRecord) {
    const label = identifierLabel(identifier);
    const confirmed = await ConfirmDialog.call({
      title: "Delete identifier",
      description: "This removes the identity claim from the asset.",
      message: `Delete ${label}?`,
      cancelText: "Keep identifier",
      confirmText: "Delete identifier",
      confirmVariant: "destructive",
    });

    if (!confirmed) {
      return;
    }

    setPendingAction({ type: "delete", identifierId: identifier.id });
    try {
      await onRemove(identifier.id);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <>
      <DetailSection
        title="Identifiers"
        count={identifiers.length}
        action={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Add identifier"
            title="Add identifier"
            onClick={() => setDialog({ mode: "add" })}
            disabled={pendingAction !== null}
          >
            <Plus strokeWidth={1.5} />
          </Button>
        }
      >
        {identifiers.length > 0 ? (
          <ul className="flex flex-col">
            {identifiers.map((identifier) => (
              <li
                key={identifier.id}
                className="-mx-2 flex h-9 items-center gap-3 rounded-md px-2 transition-colors duration-100 hover:bg-accent"
              >
                <span className="w-32 shrink-0 truncate text-13 text-muted-foreground">
                  {identifierTypeLabel(identifier.type)}
                </span>
                <span
                  className="min-w-0 flex-1 truncate font-mono text-xs text-foreground"
                  title={identifier.value}
                >
                  {identifier.value}
                </span>
                <span className="shrink-0 truncate text-13 text-subtle-foreground">
                  {identifier.namespace ?? "Global"}
                </span>
                {renderActions(identifier)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-13 text-subtle-foreground">No identifiers are recorded.</p>
        )}
      </DetailSection>
      <FormDialog
        title={dialog?.mode === "edit" ? "Edit asset identifier" : "Add asset identifier"}
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDialog(null);
          }
        }}
        submitting={isDialogPending}
      >
        {dialog ? (
          <AssetIdentifierForm
            key={dialog.mode === "edit" ? dialog.identifier.id : "new"}
            defaultValue={dialog.mode === "edit" ? dialog.identifier : undefined}
            onSubmit={handleSubmit}
            onCancel={() => setDialog(null)}
            pending={isDialogPending}
            submitLabel={dialog.mode === "edit" ? "Save changes" : "Add identifier"}
          />
        ) : null}
      </FormDialog>
    </>
  );
}
