import { useNavigate } from "@tanstack/react-router";
import { Pencil, Trash2 } from "lucide-react";
import { useMemo } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { useAssetCustomFieldDefinitionLifecycle } from "@/features/custom-fields/hooks/use-asset-custom-field-definition-lifecycle.ts";
import { useLeaveDeletedRecords } from "@/hooks/use-leave-deleted-records.ts";
import { useStableCallback } from "@/hooks/use-stable-callback.ts";

import type { PageAction } from "@/hooks/use-page-meta.tsx";
import type { AssetCustomFieldDefinition } from "@exposurenexus/contracts/model/asset-custom-field";

/** Confirms and deletes custom fields, then leaves the page or peek of any deleted field. */
export function useDeleteCustomFields() {
  const fieldLifecycle = useAssetCustomFieldDefinitionLifecycle();
  const leaveDeletedRecords = useLeaveDeletedRecords("/settings/custom-fields");

  return useStableCallback(async (fields: Array<AssetCustomFieldDefinition>) => {
    const confirmed = await ConfirmDialog.call({
      title: "Delete custom fields",
      description: "This action cannot be undone",
      message: `Are you sure you want to delete ${fields.length} custom field(s)?`,
      confirmVariant: "destructive",
    });

    if (!confirmed) {
      return;
    }

    const result = await fieldLifecycle.deleteDefinitions(fields);
    await leaveDeletedRecords(result.successful.map((field) => field.id));
  });
}

/** The custom field's ⋯ menu on its detail page and peek. */
export function useCustomFieldRecordActions(field: AssetCustomFieldDefinition) {
  const navigate = useNavigate();
  const deleteCustomFields = useDeleteCustomFields();

  return useMemo<Array<PageAction>>(
    () => [
      {
        label: "Edit custom field",
        icon: Pencil,
        onClick: () => {
          void navigate({ to: "/settings/custom-fields/$id/edit", params: { id: field.id } });
        },
      },
      {
        label: "Delete custom field…",
        icon: Trash2,
        variant: "destructive",
        onClick: () => void deleteCustomFields([field]),
      },
    ],
    [deleteCustomFields, field, navigate],
  );
}
