import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { AssetIdentifierForm, identifierTypeLabel } from "@/components/asset-identifier-editor.tsx";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { DataTable } from "@/components/data-table/data-table.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";

import type { DataTableColumnDef } from "@/components/data-table/types.ts";
import type {
  AssetIdentifierRecord,
  CreateAssetIdentifier,
} from "@exposurenexus/types/model/asset";

type IdentifierDialogState = { mode: "add" } | { mode: "edit"; identifier: AssetIdentifierRecord };

type PendingAction =
  | { type: "add" }
  | { type: "edit"; identifierId: string }
  | { type: "delete"; identifierId: string };

export interface AssetIdentifierTableProps {
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

export function AssetIdentifierTable({
  identifiers,
  onAdd,
  onUpdate,
  onRemove,
}: AssetIdentifierTableProps) {
  const [dialog, setDialog] = useState<IdentifierDialogState | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const isDialogPending = pendingAction?.type === "add" || pendingAction?.type === "edit";

  const columns: Array<DataTableColumnDef<AssetIdentifierRecord>> = [
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => (
        <span className="font-medium text-foreground">
          {identifierTypeLabel(row.original.type)}
        </span>
      ),
    },
    {
      accessorKey: "namespace",
      header: "Namespace",
      cell: ({ row }) =>
        row.original.namespace ? (
          <span className="text-muted-foreground">{row.original.namespace}</span>
        ) : (
          <span className="text-muted-foreground italic">Global</span>
        ),
    },
    {
      accessorKey: "value",
      header: "Canonical value",
      cell: ({ row }) => (
        <span className="block max-w-80 truncate font-mono text-xs" title={row.original.value}>
          {row.original.value}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const identifier = row.original;
        const label = identifierLabel(identifier);
        const isDeleting =
          pendingAction?.type === "delete" && pendingAction.identifierId === identifier.id;
        const isBusy = pendingAction !== null;

        return (
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit identifier ${label}`}
              title="Edit identifier"
              onClick={() => setDialog({ mode: "edit", identifier })}
              disabled={isBusy}
            >
              <Pencil />
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
              {isDeleting ? <Spinner /> : <Trash2 />}
            </Button>
          </div>
        );
      },
    },
  ];

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
    <Card className="w-full border-border/60 bg-shell-panel shadow-(--shell-shadow)">
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Asset identifiers</h2>
            <CardDescription>
              External identity claims used to recognize this asset across security sources.
            </CardDescription>
          </div>
          <Button type="button" size="sm" onClick={() => setDialog({ mode: "add" })}>
            <Plus />
            Add identifier
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <DataTable
          rows={[...identifiers]}
          columns={columns}
          embedded
          emptyState={
            <div className="space-y-1 px-4 py-8 text-center">
              <p className="text-sm font-medium text-foreground">No identifiers yet</p>
              <p className="text-sm text-muted-foreground">
                Add an external identity when one is known for this asset.
              </p>
            </div>
          }
        />
      </CardContent>
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open && !isDialogPending) {
            setDialog(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-150">
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "edit" ? "Edit asset identifier" : "Add asset identifier"}
            </DialogTitle>
            <DialogDescription>
              {dialog?.mode === "edit"
                ? "Update the complete identity claim. The identifier keeps its existing ID."
                : "Add a normalized identity claim to this asset."}
            </DialogDescription>
          </DialogHeader>
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
        </DialogContent>
      </Dialog>
    </Card>
  );
}
